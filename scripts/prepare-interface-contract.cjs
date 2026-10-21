'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const { readSWF } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs');
const root = path.resolve(__dirname, '..'),
  review = require('../src/legacy/client-interface-oct16.json'),
  source = path.join(root, '.test-tools/focus/deployed-oct16.swf');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
(async () => {
  if (!fs.existsSync(source)) {
    const res = await fetch(review.url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw Error('Reviewed interface source HTTP ' + res.status);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(hash(bytes), review.inputHash);
    fs.writeFileSync(source, bytes);
  }
  const input = fs.readFileSync(source);
  assert.equal(hash(input), review.inputHash, 'Unreviewed interface source');
  const base = JSON.parse(
      fs.readFileSync(path.join(root, 'runtime/game/resources/adaptive-contract-oct15.json'))
    ),
    swf = readSWF(input),
    abc = main(swf).abc;
  assert.equal(base.sourceHash, review.previousSourceHash);
  assert.equal(base.interfaceHash, review.previousInterfaceHash);
  assert.equal(hash(abc.interfaceContract), review.interfaceHash);
  // Review pins the complete new interface. Normalizing its one private native
  // constant back to 200 must reproduce the complete previous interface hash.
  // Runtime never normalizes interfaces or accepts arbitrary constant changes.
  const normalized = JSON.parse(abc.interfaceContract),
    traits = normalized.classDefs[review.classIndex][1];
  assert.deepEqual(traits[review.traitIndex], review.trait);
  traits[review.traitIndex] = review.previousTrait;
  assert.equal(
    hash(Buffer.from(JSON.stringify(normalized))),
    base.interfaceHash,
    'Only the reviewed constant may differ'
  );
  assert.equal(patchAdaptiveClient(input, base), null, 'Keep preceding contract strict');
  const recipe = structuredClone(base);
  recipe.sourceHash = review.inputHash;
  recipe.interfaceHash = review.interfaceHash;
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'All original pools, hooks, dependencies and bindings must match');
  const after = readSWF(output),
    edited = new Set(recipe.bodies.map((b) => b.id));
  assert(main(after).abc.interfaceContract.equals(abc.interfaceContract));
  for (const body of abc.bodies)
    if (!edited.has(body.id))
      assert(
        body.bytes.equals(main(after).abc.bodies.find((b) => b.id === body.id).bytes),
        'Preserve ' + body.name
      );
  for (const tag of swf.tags)
    if (tag !== main(swf))
      assert(
        after.tags.some((t) => t.raw.equals(tag.raw)),
        'Preserve every upstream tag'
      );
  fs.writeFileSync(
    path.join(root, 'runtime/game/resources/adaptive-contract-oct16.json'),
    JSON.stringify(recipe)
  );
  console.log(
    'Prepared separately guarded October 16 interface contract; all native changes retained.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
