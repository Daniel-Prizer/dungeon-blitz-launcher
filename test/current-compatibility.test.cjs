'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs');
const { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs');
const pin = require('../src/legacy/client-current-nov10.json');
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.test-tools/current-nov10-contract/source.swf');
const recipeFile = path.join(root, 'runtime/game/resources/adaptive-contract-effects-oct28.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const main = (swf) =>
  swf.tags.find((tag) => tag.abc?.bodies.some((b) => b.name === 'Main.method_561'));
test(
  'current exact envelopes preserve upstream helpers and reject unknown damage or map bodies',
  { skip: !fs.existsSync(source) || !fs.existsSync(recipeFile) },
  () => {
    const input = fs.readFileSync(source),
      recipe = JSON.parse(fs.readFileSync(recipeFile));
    assert.equal(hash(input), pin.inputHash);
    const swf = readSWF(input),
      tag = main(swf);
    const output = patchAdaptiveClient(input, recipe);
    assert(output, 'Prepared current recipe must accept the exact reviewed source');
    const parsed = readSWF(output),
      result = main(parsed).abc;
    const edited = new Set(recipe.bodies.map((b) => b.id));
    for (const body of tag.abc.bodies)
      if (!edited.has(body.id))
        assert.equal(
          hash(result.bodies.find((b) => b.id === body.id).bytes),
          hash(body.bytes),
          body.name
        );
    for (const other of swf.tags)
      if (other !== tag) assert(parsed.tags.some((t) => hash(t.raw) === hash(other.raw)));
    for (const method of pin.methods) {
      const body = tag.abc.bodies.find((b) => b.name === method.name);
      const mutated = Buffer.from(body.bytes);
      mutated[body.codeOffset] ^= 1;
      const unknown = writeSWF(
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
      assert.equal(
        patchAdaptiveClient(unknown, recipe),
        null,
        method.name + ' unknown envelope must fail'
      );
      const oldRecipe = structuredClone(recipe);
      const edit = oldRecipe.bodies.find((b) => b.name === method.name);
      edit.variants = edit.variants.filter((v) => v.delta.inputHash !== method.bodyHash);
      assert.equal(
        patchAdaptiveClient(input, oldRecipe),
        null,
        method.name + ' requires its reviewed variant'
      );
    }
  }
);
