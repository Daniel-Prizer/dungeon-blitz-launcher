'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  pin = require('../src/legacy/client-effects-oct28.json');
const root = path.resolve(__dirname, '..'),
  source = path.join(root, '.test-tools/effects-contract-oct28/source.swf'),
  recipeFile = path.join(root, 'runtime/game/resources/adaptive-contract-effects-oct28.json'),
  present = fs.existsSync(source) && fs.existsSync(recipeFile),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (swf) => swf.tags.find((t) => t.abc?.bodies.some((b) => b.name === pin.method));

test(
  'own-effects update retains upstream bodies and rejects unfamiliar effect instructions',
  { skip: !present },
  () => {
    const input = fs.readFileSync(source),
      recipe = JSON.parse(fs.readFileSync(recipeFile));
    assert.equal(hash(input), pin.inputHash);
    const before = readSWF(input),
      output = patchAdaptiveClient(input, recipe);
    assert(output, 'Complete effects contract');
    const after = readSWF(output),
      a = main(before),
      b = main(after),
      edited = new Set(recipe.bodies.map((m) => m.id));
    assert.equal(hash(b.abc.interfaceContract), pin.interfaceHash);
    for (const body of a.abc.bodies)
      if (!edited.has(body.id))
        assert(
          body.bytes.equals(b.abc.bodies.find((m) => m.id === body.id).bytes),
          body.name || String(body.id)
        );
    for (const tag of before.tags)
      if (tag !== a) assert(after.tags.some((t) => t.raw.equals(tag.raw)));
    const body = a.abc.bodies.find((m) => m.name === pin.method),
      changed = Buffer.from(body.bytes);
    changed[body.codeOffset + 2] ^= 1;
    const mutated = writeSWF(
      before,
      before.tags.map((t) =>
        t === a
          ? encodeTag(
              82,
              Buffer.concat([
                t.lead,
                t.abc.prefix,
                ...t.abc.bodies.map((m) => (m === body ? changed : m.bytes)),
              ])
            )
          : t.raw
      )
    );
    assert.equal(patchAdaptiveClient(mutated, recipe), null);
    assert.equal(patchAdaptiveClient(input, { ...recipe, interfaceHash: '0'.repeat(64) }), null);
    assert.equal(patchAdaptiveClient(input, { ...recipe, helpers: [] }), null);
  }
);
