'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  pin = require('../src/legacy/client-damage-oct26.json');
const source = path.resolve('.test-tools/damage-contract-oct26/source.swf'),
  recipeFile = path.resolve('runtime/game/resources/adaptive-contract-backdrop-oct19.json'),
  present = fs.existsSync(source) && fs.existsSync(recipeFile),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Entity.TakeDamage'));
test(
  'October 26 damage hook preserves new combat bodies, group floaters and upstream helpers',
  { skip: !present },
  () => {
    const input = fs.readFileSync(source),
      recipe = JSON.parse(fs.readFileSync(recipeFile));
    assert.equal(hash(input), pin.inputHash);
    const before = readSWF(input),
      output = patchAdaptiveClient(input, recipe);
    assert(output);
    const after = readSWF(output),
      a = main(before),
      b = main(after),
      edited = new Set(recipe.bodies.map((e) => e.id));
    for (const body of a.abc.bodies)
      if (!edited.has(body.id))
        assert(b.abc.bodies.find((m) => m.id === body.id).bytes.equals(body.bytes), body.name);
    const damage = b.abc.bodies.find((m) => m.name === pin.method),
      original = a.abc.bodies.find((m) => m.name === pin.method);
    assert(
      damage.code.subarray(0, 60).equals(original.code.subarray(0, 60)),
      'Keep the newly added floater before all audio wrappers'
    );
    assert.equal(
      damage.code.length - original.code.length,
      45,
      'Only three existing sound-context wrappers'
    );
    for (const tag of before.tags)
      if (tag !== a)
        assert(
          after.tags.some((t) => t.raw.equals(tag.raw)),
          'Preserve upstream tags'
        );
  }
);
test(
  'damage envelope still rejects unreviewed edits and the prior recipe rejects the new hook',
  { skip: !present },
  () => {
    const input = fs.readFileSync(source),
      recipe = JSON.parse(fs.readFileSync(recipeFile)),
      edit = recipe.bodies.find((e) => e.name === pin.method);
    assert(edit.variants.some((v) => v.delta.inputHash === pin.bodyHash));
    const previous = structuredClone(recipe);
    previous.bodies.find((e) => e.name === pin.method).variants = edit.variants.filter(
      (v) => v.delta.inputHash !== pin.bodyHash
    );
    assert.equal(patchAdaptiveClient(input, previous), null);
    const swf = readSWF(input),
      tag = main(swf),
      body = tag.abc.bodies.find((b) => b.name === pin.method),
      mutated = Buffer.from(body.bytes);
    mutated[body.codeOffset + 1] ^= 1;
    const changed = writeSWF(
      swf,
      swf.tags.map((t) =>
        t === tag
          ? encodeTag(
              82,
              Buffer.concat([
                tag.lead,
                tag.abc.prefix,
                ...tag.abc.bodies.map((b) => (b === body ? mutated : b.bytes)),
              ])
            )
          : t.raw
      )
    );
    assert.equal(patchAdaptiveClient(changed, recipe), null);
  }
);
