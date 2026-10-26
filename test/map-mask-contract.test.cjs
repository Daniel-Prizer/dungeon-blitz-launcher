'use strict';
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  test = require('node:test'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  pin = require('../src/legacy/client-map-mask-oct24.json');
const source = '.test-tools/focus/map-mask-oct24.swf',
  prior = '.test-tools/focus/previous-oct23.swf',
  file = 'runtime/game/resources/adaptive-contract-backdrop-oct19.json',
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
  main = (swf) => swf.tags.find((tag) => tag.abc?.bodies.some((b) => b.name === 'Main.method_561'));
test(
  'map-mask variant retains upstream drawing and repaint helpers, old output and strict envelope rejection',
  { skip: ![source, prior, file].every((f) => fs.existsSync(f)) },
  () => {
    const input = fs.readFileSync(source),
      recipe = JSON.parse(fs.readFileSync(file));
    assert.equal(hash(input), pin.inputHash);
    const output = patchAdaptiveClient(input, recipe);
    assert(output);
    const before = readSWF(input),
      after = readSWF(output),
      tag = main(before),
      abc = tag.abc,
      patched = main(after).abc,
      body = abc.bodies.find((b) => b.name === pin.method),
      fixed = patched.bodies.find((b) => b.id === body.id),
      offset = body.codeOffset + pin.codeOffset,
      expected = Buffer.from(body.bytes);
    Buffer.from(pin.replacement, 'hex').copy(expected, offset);
    assert(fixed.bytes.equals(expected), 'Only the authored map width expression changes');
    const edited = new Set(recipe.bodies.map((b) => b.id));
    for (const b of abc.bodies)
      if (!edited.has(b.id))
        assert(patched.bodies.find((p) => p.id === b.id).bytes.equals(b.bytes));
    for (const t of before.tags) if (t !== tag) assert(after.tags.some((p) => p.raw.equals(t.raw)));
    assert.equal(
      hash(patchAdaptiveClient(fs.readFileSync(prior), recipe)),
      require('../src/native-player-admission.json').enhanced[hash(fs.readFileSync(prior))]
    );
    const damaged = Buffer.from(body.bytes);
    damaged[body.codeOffset] ^= 1;
    const unknown = writeSWF(
      before,
      before.tags.map((t) =>
        t === tag
          ? encodeTag(
              82,
              Buffer.concat([
                tag.lead,
                abc.prefix,
                ...abc.bodies.map((b) => (b === body ? damaged : b.bytes)),
              ])
            )
          : t.raw
      )
    );
    assert.equal(patchAdaptiveClient(unknown, recipe), null);
    for (const mutate of [
      (e) => e.variants.push(structuredClone(e.variants[0])),
      (e) => (e.variants = Array(8).fill(e.variants[0])),
      (e) => (e.variants[0].delta.outputHash = '0'.repeat(64)),
      (e) => (e.variants[0].delta.inputHash = e.delta.inputHash),
      (e) => (e.variants[0].references = null),
      (e) => (e.variants[0].references = [{ pool: 'strings', index: 9999999, offset: 0 }]),
    ]) {
      const bad = structuredClone(recipe);
      mutate(bad.bodies.find((b) => b.id === body.id));
      assert.equal(patchAdaptiveClient(input, bad), null);
    }
  }
);
