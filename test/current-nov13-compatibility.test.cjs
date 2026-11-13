'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs');
const { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs');
const root = path.resolve(__dirname, '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
test('November interface restores existing features, preserves upstream code and rejects altered hooks', () => {
  const input = fs.readFileSync(path.join(root, '.test-tools/current-nov13/source.swf'));
  const recipe = JSON.parse(
    fs.readFileSync(path.join(root, 'runtime/game/resources/adaptive-contract-nov13.json'))
  );
  const previous = JSON.parse(
    fs.readFileSync(path.join(root, 'runtime/game/resources/adaptive-contract-effects-oct28.json'))
  );
  assert.equal(patchAdaptiveClient(input, previous), null);
  assert.equal(
    hash(Buffer.from(JSON.stringify(recipe.bodies))),
    hash(Buffer.from(JSON.stringify(previous.bodies)))
  );
  assert.equal(
    hash(Buffer.from(JSON.stringify(recipe.guards))),
    hash(Buffer.from(JSON.stringify(previous.guards)))
  );
  const output = patchAdaptiveClient(input, recipe);
  assert(output);
  assert.equal(hash(output), require('../src/native-player-admission.json').enhanced[hash(input)]);
  const swf = readSWF(input),
    parsed = readSWF(output);
  const main = (value) =>
    value.tags.find((tag) => tag.abc?.bodies.some((body) => body.name === 'Main.method_561'));
  const tag = main(swf),
    result = main(parsed).abc;
  const edited = new Set(recipe.bodies.map((body) => body.id));
  for (const body of tag.abc.bodies)
    if (!edited.has(body.id))
      assert.equal(
        hash(result.bodies.find((other) => other.id === body.id).bytes),
        hash(body.bytes),
        body.name
      );
  for (const other of swf.tags)
    if (other !== tag) assert(parsed.tags.some((value) => hash(value.raw) === hash(other.raw)));
  const body = tag.abc.bodies.find((value) => value.name === 'Entity.TakeDamage');
  const mutated = Buffer.from(body.bytes);
  mutated[body.codeOffset] ^= 1;
  const unknown = writeSWF(
    swf,
    swf.tags.map((value) =>
      value === tag
        ? encodeTag(
            82,
            Buffer.concat([
              tag.lead,
              tag.abc.prefix,
              ...tag.abc.bodies.map((value) => (value === body ? mutated : value.bytes)),
            ])
          )
        : value.raw
    )
  );
  assert.equal(patchAdaptiveClient(unknown, recipe), null);
});
