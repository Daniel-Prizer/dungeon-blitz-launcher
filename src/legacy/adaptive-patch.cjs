'use strict';
const crypto = require('crypto'),
  zlib = require('zlib');
const {
  readSWF,
  encodeTag,
  writeSWF,
  encodePools,
  integer,
  poolKinds,
} = require('./swf-contract.cjs');
const { patchAudio } = require('./audio-patch.cjs');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function applyDelta(bytes, delta) {
  const header = Buffer.alloc(8);
  header.write('CWS');
  header[3] = 10;
  header.writeUInt32LE(bytes.length + 8, 4);
  const patched = patchAudio(Buffer.concat([header, zlib.deflateSync(bytes)]), delta);
  if (!patched) throw Error('Contract delta mismatch');
  return zlib.inflateSync(patched.subarray(8), { maxOutputLength: 4 * 1024 * 1024 });
}
// Reuse only signed, locally compiled replacements. Whole method envelopes and
// original pool entries and the semantic class/method/script interfaces must
// still match. Appended symbols are preserved and helper references relocated.
// Changed bodies outside these explicit contracts remain byte-for-byte intact.
function patchAdaptiveClient(input, recipe) {
  try {
    if (
      !recipe ||
      recipe.format !== 2 ||
      !Array.isArray(recipe.bodies) ||
      recipe.bodies.length > 128 ||
      !Array.isArray(recipe.guards) ||
      recipe.guards.length > 128 ||
      !Array.isArray(recipe.helpers) ||
      recipe.helpers.length !== 4
    )
      return null;
    const swf = readSWF(input);
    if (hash(swf.preamble) !== recipe.preambleHash) return null;
    const candidates = swf.tags.filter(
      (tag) => tag.abc && hash(tag.abc.interfaceContract) === recipe.interfaceHash
    );
    if (candidates.length !== 1) return null;
    const main = candidates[0];
    if (hash(main.lead) !== recipe.leadHash) return null;
    // Original root-class bindings must also remain unchanged.
    const bindings = swf.tags.filter((tag) => tag.type === 76).map((tag) => hash(tag.raw));
    if (JSON.stringify(bindings) !== JSON.stringify(recipe.bindings)) return null;
    // Do not load duplicate or game-supplied definitions of our own helpers.
    for (const tag of swf.tags)
      if (
        tag.abc &&
        tag.abc.bodies.some((body) => /^Blitz(Audio|Display|Input|FrameCounter)\./.test(body.name))
      )
        return null;
    const bodies = new Map(main.abc.bodies.map((body) => [body.id, body]));
    for (const guard of recipe.guards) {
      const body = bodies.get(guard.id);
      if (!body || body.name !== guard.name || hash(body.bytes) !== guard.hash) return null;
    }
    const pools = {},
      map = (kind, id) => {
        const original = recipe.pools[kind],
          current = main.abc.pools[kind];
        if (!Number.isInteger(id) || id < 0 || id >= original.count + original.append.length)
          throw Error('Invalid relocation reference');
        return id < original.count ? id : current.length + id - original.count;
      };
    for (const kind of poolKinds) {
      const original = recipe.pools[kind],
        current = main.abc.pools[kind];
      if (
        !original ||
        !Number.isInteger(original.count) ||
        original.count < 1 ||
        !Array.isArray(original.append) ||
        original.append.length > 10000 ||
        current.length < original.count ||
        hash(Buffer.from(JSON.stringify(current.slice(0, original.count)))) !== original.inputHash
      )
        return null;
    }
    for (const kind of poolKinds) {
      const added = recipe.pools[kind].append.map((entry) => {
        if (kind === 'namespaces') return [entry[0], map('strings', entry[1])];
        if (kind === 'nsSets') return entry.map((id) => map('namespaces', id));
        if (kind !== 'multinames') return entry;
        switch (entry[0]) {
          case 7:
          case 13:
            return [entry[0], map('namespaces', entry[1]), map('strings', entry[2])];
          case 15:
          case 16:
            return [entry[0], map('strings', entry[1])];
          case 9:
          case 14:
            return [entry[0], map('strings', entry[1]), map('nsSets', entry[2])];
          case 27:
          case 28:
            return [entry[0], map('nsSets', entry[1])];
          case 29:
            return [entry[0], ...entry.slice(1).map((id) => map('multinames', id))];
          case 17:
          case 18:
            return entry;
          default:
            throw Error('Unknown relocated multiname');
        }
      });
      pools[kind] = [...main.abc.pools[kind], ...added];
      if (pools[kind].length > 100000) return null;
    }
    const replacements = new Map();
    for (const edit of recipe.bodies) {
      const body = bodies.get(edit.id);
      if (
        !body ||
        body.name !== edit.name ||
        replacements.has(edit.id) ||
        !Array.isArray(edit.references) ||
        edit.references.length > 1000
      )
        return null;
      if (
        edit.variants !== undefined &&
        (!Array.isArray(edit.variants) || edit.variants.length > 7)
      )
        return null;
      const variants = [edit, ...(edit.variants || [])],
        hashes = new Set();
      for (const variant of variants) {
        const inputHash = variant?.delta?.inputHash;
        if (
          !/^[a-f0-9]{64}$/.test(inputHash) ||
          hashes.has(inputHash) ||
          !Array.isArray(variant.references) ||
          variant.references.length > 1000
        )
          return null;
        hashes.add(inputHash);
      }
      // Each reviewed envelope retains its own exact delta and relocation table.
      const variant = variants.find((entry) => entry.delta.inputHash === hash(body.bytes));
      if (!variant) return null;
      const replacement = applyDelta(body.bytes, variant.delta);
      for (const ref of variant.references) {
        const old = integer(ref.index),
          value = integer(map(ref.pool, ref.index));
        if (
          !Number.isInteger(ref.offset) ||
          ref.offset < 0 ||
          ref.offset + old.length > replacement.length ||
          old.length !== value.length ||
          !replacement.subarray(ref.offset, ref.offset + old.length).equals(old)
        )
          return null;
        value.copy(replacement, ref.offset);
      }
      replacements.set(edit.id, replacement);
    }
    const prefix = Buffer.concat([
        main.abc.prefix.subarray(0, 4),
        encodePools(pools),
        main.abc.prefix.subarray(main.abc.poolEnd),
      ]),
      data = Buffer.concat([
        main.lead,
        prefix,
        ...main.abc.bodies.map((body) => replacements.get(body.id) || body.bytes),
      ]);
    const helpers = recipe.helpers.map((entry) => {
      const raw = Buffer.from(entry.data, 'base64');
      if (raw.length > 1024 * 1024 || hash(raw) !== entry.hash) throw Error('Invalid helper');
      return raw;
    });
    const tags = [];
    let inserted = false;
    for (const tag of swf.tags) {
      if (!inserted && tag.type === 1) {
        tags.push(...helpers);
        inserted = true;
      }
      tags.push(tag === main ? encodeTag(82, data) : tag.raw);
    }
    if (!inserted) return null;
    const output = writeSWF(swf, tags),
      parsed = readSWF(output);
    const outputMain = parsed.tags.find(
      (tag) => tag.abc && hash(tag.abc.interfaceContract) === recipe.interfaceHash
    );
    if (!outputMain) return null;
    for (const body of outputMain.abc.bodies) {
      const expected = replacements.get(body.id) || bodies.get(body.id)?.bytes;
      if (!expected || !body.bytes.equals(expected)) return null;
    }
    return output;
  } catch (_) {
    return null;
  }
}
module.exports = { patchAdaptiveClient };
