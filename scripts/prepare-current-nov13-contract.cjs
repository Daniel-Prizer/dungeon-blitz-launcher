'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { readSWF } = require('../src/legacy/swf-contract.cjs');
const { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs');
const pin = require('../src/legacy/client-current-nov13.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const main = (swf) =>
  swf.tags.find((tag) => tag.abc?.bodies.some((body) => body.name === 'Main.method_561'));
async function prepare(root = path.resolve(__dirname, '..'), source) {
  source ||= path.join(root, '.test-tools/current-nov13/source.swf');
  if (!fs.existsSync(source)) {
    const bytes = await require('../src/game-source.cjs').publicBytes(pin.url, 4 * 1024 * 1024);
    assert.equal(hash(bytes), pin.inputHash);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, bytes);
  }
  const input = fs.readFileSync(source);
  assert.equal(hash(input), pin.inputHash);
  const swf = readSWF(input),
    tag = main(swf),
    abc = tag.abc;
  const recipe = JSON.parse(
    fs.readFileSync(path.join(root, 'runtime/game/resources/adaptive-contract-effects-oct28.json'))
  );
  assert.equal(recipe.interfaceHash, pin.previousInterfaceHash);
  assert.equal(hash(abc.interfaceContract), pin.interfaceHash);
  const strings = abc.pools.strings.slice(0, recipe.pools.strings.count);
  assert.equal(strings[pin.changedStringIndex], pin.currentString);
  assert.equal(hash(Buffer.from(JSON.stringify(strings))), pin.stringPrefixHash);
  strings[pin.changedStringIndex] = pin.previousString;
  assert.equal(hash(Buffer.from(JSON.stringify(strings))), recipe.pools.strings.inputHash);
  assert.equal(patchAdaptiveClient(input, recipe), null);
  // Separate exact interface/pool variant; every original hook and dependency
  // envelope remains unchanged. New game methods and helper tags are retained.
  recipe.sourceHash = pin.inputHash;
  recipe.interfaceHash = pin.interfaceHash;
  recipe.pools.strings.inputHash = pin.stringPrefixHash;
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'All existing feature hooks and dependency guards must pass');
  const parsed = readSWF(output),
    after = main(parsed).abc;
  assert.equal(hash(after.interfaceContract), pin.interfaceHash);
  const edited = new Set(recipe.bodies.map((body) => body.id));
  for (const body of abc.bodies)
    if (!edited.has(body.id))
      assert.equal(
        hash(after.bodies.find((other) => other.id === body.id).bytes),
        hash(body.bytes),
        body.name
      );
  for (const other of swf.tags)
    if (other !== tag) assert(parsed.tags.some((value) => hash(value.raw) === hash(other.raw)));
  fs.writeFileSync(
    path.join(root, 'runtime/game/resources/adaptive-contract-nov13.json'),
    JSON.stringify(recipe)
  );
  console.log(
    JSON.stringify({
      source: pin.inputHash,
      enhanced: hash(output),
      hooks: edited.size,
      unhookedBodiesPreserved: abc.bodies.length - edited.size,
      upstreamTagsPreserved: swf.tags.length - 1,
    })
  );
}
if (require.main === module)
  prepare(undefined, process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { prepare };
