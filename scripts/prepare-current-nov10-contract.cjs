'use strict';
// Offline compilation of two reviewed envelopes. Runtime guards stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  readSWF,
  writeSWF,
  encodeTag,
  encodePools,
  integer,
} = require('../src/legacy/swf-contract.cjs');
const { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs');
const { makeDelta } = require('./audio-delta.cjs');
const pin = require('../src/legacy/client-current-nov10.json');
const root = path.resolve(__dirname, '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const main = (swf) =>
  swf.tags.find((tag) => tag.abc?.bodies.some((b) => b.name === 'Main.method_561'));
function prepare(source, recipeFile) {
  const dir = path.join(root, '.test-tools/current-nov10-contract');
  fs.mkdirSync(dir, { recursive: true });
  const input = fs.readFileSync(source);
  assert.equal(hash(input), pin.inputHash);
  fs.writeFileSync(path.join(dir, 'source.swf'), input);
  const swf = readSWF(input),
    tag = main(swf),
    abc = tag.abc;
  const recipe = JSON.parse(fs.readFileSync(recipeFile));
  for (const method of pin.methods) {
    const body = abc.bodies.find((b) => b.name === method.name);
    assert.equal(hash(body.bytes), method.bodyHash);
    assert.equal(hash(body.code), method.codeHash);
  }
  const map = (kind, id) =>
    id < recipe.pools[kind].count ? id : abc.pools[kind].length + id - recipe.pools[kind].count;
  const pools = {};
  for (const [kind, pool] of Object.entries(recipe.pools)) {
    assert.equal(
      hash(Buffer.from(JSON.stringify(abc.pools[kind].slice(0, pool.count)))),
      pool.inputHash
    );
    pools[kind] = [
      ...abc.pools[kind],
      ...pool.append.map((entry) => {
        if (kind === 'namespaces') return [entry[0], map('strings', entry[1])];
        if (kind === 'nsSets') return entry.map((id) => map('namespaces', id));
        if (kind !== 'multinames') return entry;
        if ([7, 13].includes(entry[0]))
          return [entry[0], map('namespaces', entry[1]), map('strings', entry[2])];
        if ([15, 16].includes(entry[0])) return [entry[0], map('strings', entry[1])];
        if ([9, 14].includes(entry[0]))
          return [entry[0], map('strings', entry[1]), map('nsSets', entry[2])];
        if ([27, 28].includes(entry[0])) return [entry[0], map('nsSets', entry[1])];
        if (entry[0] === 29)
          return [entry[0], ...entry.slice(1).map((id) => map('multinames', id))];
        assert([17, 18].includes(entry[0]));
        return entry;
      }),
    ];
  }
  const augmented = path.join(dir, 'pools.swf'),
    compiled = path.join(dir, 'wrapped.swf'),
    refsFile = path.join(dir, 'refs.json');
  const prefix = Buffer.concat([
    abc.prefix.subarray(0, 4),
    encodePools(pools),
    abc.prefix.subarray(abc.poolEnd),
  ]);
  fs.writeFileSync(
    augmented,
    writeSWF(
      swf,
      swf.tags.map((t) =>
        t === tag
          ? encodeTag(82, Buffer.concat([tag.lead, prefix, ...abc.bodies.map((b) => b.bytes)]))
          : t.raw
      )
    )
  );
  const lib = path.join(root, '.test-tools/focus/ffdec/lib/*');
  const run = (exe, args) =>
    execFileSync(exe, args, { windowsHide: true, stdio: 'inherit', timeout: 60000 });
  run('javac', [
    '-cp',
    lib,
    '-d',
    dir,
    ...[
      'AudioPatchBuilder.java',
      'DisplayPatchBuilder.java',
      'CurrentCompatibilityBuilder.java',
      'ContractReferences.java',
    ].map((name) => path.join(__dirname, name)),
  ]);
  const java = ['-Xmx512m', '-Djava.awt.headless=true', '-cp', dir + path.delimiter + lib];
  run('java', [...java, 'CurrentCompatibilityBuilder', augmented, compiled]);
  run('java', [...java, 'ContractReferences', source, compiled, refsFile]);
  const wrapped = main(readSWF(fs.readFileSync(compiled))).abc;
  assert.equal(
    hash(Buffer.from(JSON.stringify(wrapped.pools))),
    hash(Buffer.from(JSON.stringify(pools)))
  );
  const refs = JSON.parse(fs.readFileSync(refsFile));
  for (const method of pin.methods) {
    const body = abc.bodies.find((b) => b.name === method.name),
      fixed = wrapped.bodies.find((b) => b.id === body.id);
    const edit = recipe.bodies.find((b) => b.id === body.id && b.name === method.name);
    assert(edit);
    const bytes = Buffer.from(fixed.bytes);
    const references = refs
      .filter((r) => r.id === body.id)
      .map(({ offset, pool, index }) => {
        assert(index >= abc.pools[pool].length);
        const virtual = recipe.pools[pool].count + index - abc.pools[pool].length;
        const from = integer(index),
          to = integer(virtual),
          at = fixed.codeOffset + offset;
        assert.equal(from.length, to.length);
        assert(bytes.subarray(at, at + from.length).equals(from));
        to.copy(bytes, at);
        return { offset: at, pool, index: virtual };
      });
    assert.equal(references.length, method.references);
    if (![edit, ...(edit.variants || [])].some((v) => v.delta.inputHash === method.bodyHash)) {
      assert((edit.variants || []).length < 7);
      edit.variants = [
        ...(edit.variants || []),
        { delta: makeDelta(body.bytes, bytes), references },
      ];
    }
  }
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'Complete guarded contract must pass');
  const parsed = readSWF(output),
    result = main(parsed).abc;
  const edited = new Set(recipe.bodies.map((b) => b.id));
  for (const body of abc.bodies) {
    if (!edited.has(body.id))
      assert.equal(
        hash(result.bodies.find((b) => b.id === body.id).bytes),
        hash(body.bytes),
        body.name
      );
    if (pin.methods.some((m) => m.name === body.name))
      assert.equal(
        hash(result.bodies.find((b) => b.id === body.id).bytes),
        hash(wrapped.bodies.find((b) => b.id === body.id).bytes),
        body.name
      );
  }
  for (const t of swf.tags)
    if (t !== tag) assert(parsed.tags.some((p) => hash(p.raw) === hash(t.raw)));
  fs.writeFileSync(recipeFile, JSON.stringify(recipe));
  fs.writeFileSync(path.join(dir, 'enhanced.swf'), output);
  console.log(
    JSON.stringify({
      source: pin.inputHash,
      enhanced: hash(output),
      methods: pin.methods.map((m) => m.name),
      unhookedBodiesPreserved: abc.bodies.length - edited.size,
      upstreamTagsPreserved: swf.tags.length - 1,
    })
  );
}
if (require.main === module)
  (async () => {
    const source = process.argv[2]
      ? path.resolve(process.argv[2])
      : path.join(root, '.test-tools/current-nov10-contract/source.swf');
    if (!fs.existsSync(source)) {
      const bytes = await require('../src/game-source.cjs').publicBytes(pin.url, 4 * 1024 * 1024);
      assert.equal(hash(bytes), pin.inputHash);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, bytes);
    }
    prepare(
      source,
      process.argv[3]
        ? path.resolve(process.argv[3])
        : path.join(root, 'runtime/game/resources/adaptive-contract-effects-oct28.json')
    );
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { prepare };
