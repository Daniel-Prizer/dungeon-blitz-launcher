'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const { readSWF } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  { makeDelta } = require('./audio-delta.cjs');
const root = path.resolve(__dirname, '..'),
  review = require('../src/legacy/client-recovery-oct17.json'),
  dir = path.join(root, '.test-tools/recovery-contract'),
  source = path.join(dir, 'source.swf');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(source)) {
    const r = await fetch(review.url, { signal: AbortSignal.timeout(30000) });
    assert(r.ok);
    const b = Buffer.from(await r.arrayBuffer());
    assert.equal(hash(b), review.inputHash);
    fs.writeFileSync(source, b);
  }
  const input = fs.readFileSync(source);
  assert.equal(hash(input), review.inputHash);
  const base = JSON.parse(
      fs.readFileSync(path.join(root, 'runtime/game/resources/adaptive-contract-oct17.json'))
    ),
    previous = fs.readFileSync(path.join(root, '.test-tools/focus/deployed-oct17.swf'));
  assert.equal(hash(previous), base.sourceHash);
  assert(patchAdaptiveClient(previous, base));
  assert.equal(patchAdaptiveClient(input, base), null);
  const old = main(readSWF(previous)).abc,
    abc = main(readSWF(input)).abc;
  assert(old.interfaceContract.equals(abc.interfaceContract));
  for (const pin of review.methods) {
    const body = old.bodies.find((b) => b.name === pin.name),
      edit = base.bodies.find((b) => b.name === pin.name),
      current = abc.bodies.find((b) => b.name === pin.name);
    assert.equal(hash(current.bytes), pin.bodyHash);
    assert.equal(hash(current.code), pin.codeHash);
    assert.equal(hash(body.bytes), edit.delta.inputHash);
    const template = Buffer.concat(
      edit.delta.operations.map((op) =>
        op.copy
          ? body.bytes.subarray(op.copy[0], op.copy[0] + op.copy[1])
          : Buffer.from(op.data, 'base64')
      )
    );
    assert.equal(hash(template), edit.delta.outputHash);
    fs.writeFileSync(
      path.join(dir, pin.name + '.bin'),
      template.subarray(
        body.codeOffset,
        body.codeOffset + body.code.length + template.length - body.bytes.length
      )
    );
  }
  const jar = path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
    cp = jar + path.delimiter + path.join(root, '.test-tools/focus/ffdec/lib/*');
  execFileSync('javac', ['-cp', cp, '-d', dir, path.join(__dirname, 'RecoveryPatchBuilder.java')], {
    stdio: 'inherit',
    windowsHide: true,
  });
  const outputFile = path.join(dir, 'reviewed.swf');
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-cp',
      dir + path.delimiter + cp,
      'RecoveryPatchBuilder',
      source,
      outputFile,
      dir,
    ],
    { stdio: 'inherit', windowsHide: true }
  );
  const rebuilt = main(readSWF(fs.readFileSync(outputFile))).abc,
    recipe = structuredClone(base);
  recipe.sourceHash = review.inputHash;
  for (const pin of review.methods) {
    const before = abc.bodies.find((b) => b.name === pin.name),
      after = rebuilt.bodies.find((b) => b.name === pin.name),
      edit = recipe.bodies.find((b) => b.name === pin.name);
    edit.delta = makeDelta(before.bytes, after.bytes);
    assert.equal(before.codeOffset, after.codeOffset);
  }
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'All remaining hooks, pools, dependencies and bindings remain guarded');
  const after = readSWF(output),
    afterABC = main(after).abc,
    edited = new Set(recipe.bodies.map((b) => b.id));
  for (const b of abc.bodies)
    if (!edited.has(b.id))
      assert(
        b.bytes.equals(afterABC.bodies.find((a) => a.id === b.id).bytes),
        'Preserve ' + b.name
      );
  for (const tag of readSWF(input).tags)
    if (!tag.abc?.bodies.some((b) => b.name === 'Main.method_561'))
      assert(after.tags.some((t) => t.raw.equals(tag.raw)));
  fs.writeFileSync(
    path.join(root, 'runtime/game/resources/adaptive-contract-recovery-oct17.json'),
    JSON.stringify(recipe)
  );
  console.log(
    'Prepared exact October 17 recovery contract; upstream catch handlers, terrain healing and entity/removal code retained.'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
