'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const { readSWF } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  { publicBytes } = require('../src/game-source.cjs'),
  { makeDelta } = require('./audio-delta.cjs'),
  pin = require('../src/legacy/client-map-mask-oct24.json');
const root = path.resolve(__dirname, '..'),
  source = path.join(root, '.test-tools/focus/map-mask-oct24.swf'),
  file = path.join(root, 'runtime/game/resources/adaptive-contract-backdrop-oct19.json'),
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
  main = (swf) => swf.tags.find((tag) => tag.abc?.bodies.some((b) => b.name === 'Main.method_561'));
(async () => {
  if (!fs.existsSync(source)) {
    const bytes = await publicBytes(pin.url, 4 * 1024 * 1024);
    assert.equal(hash(bytes), pin.inputHash);
    fs.writeFileSync(source, bytes);
  }
  const input = fs.readFileSync(source);
  assert.equal(hash(input), pin.inputHash);
  const swf = readSWF(input),
    abc = main(swf).abc,
    body = abc.bodies.find((b) => b.name === pin.method),
    recipe = JSON.parse(fs.readFileSync(file)),
    edit = recipe.bodies.find((b) => b.id === body.id && b.name === pin.method);
  assert(edit);
  assert.equal(hash(body.bytes), pin.bodyHash);
  assert.equal(hash(body.code), pin.codeHash);
  const expected = Buffer.from(pin.expected, 'hex'),
    replacement = Buffer.from(pin.replacement, 'hex'),
    fixed = Buffer.from(body.bytes),
    offset = body.codeOffset + pin.codeOffset;
  assert.equal(expected.length, replacement.length);
  assert(fixed.subarray(offset, offset + expected.length).equals(expected));
  replacement.copy(fixed, offset);
  assert(fixed.subarray(0, offset).equals(body.bytes.subarray(0, offset)));
  assert(
    fixed
      .subarray(offset + replacement.length)
      .equals(body.bytes.subarray(offset + expected.length))
  );
  assert.equal(edit.references.length, 0);
  assert(!edit.variants || edit.variants.length === 0);
  edit.variants = [{ delta: makeDelta(body.bytes, fixed), references: [] }];
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'Complete contract must still pass');
  const parsed = readSWF(output),
    patched = main(parsed).abc;
  assert(patched.bodies.find((b) => b.id === body.id).bytes.equals(fixed));
  const edited = new Set(recipe.bodies.map((b) => b.id));
  for (const b of abc.bodies)
    if (!edited.has(b.id)) assert(patched.bodies.find((p) => p.id === b.id).bytes.equals(b.bytes));
  for (const tag of swf.tags)
    if (tag !== main(swf)) assert(parsed.tags.some((t) => t.raw.equals(tag.raw)));
  fs.writeFileSync(file, JSON.stringify(recipe));
  console.log(
    'Prepared exact map-mask envelope; upstream helpers and every unrelated method retained.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
