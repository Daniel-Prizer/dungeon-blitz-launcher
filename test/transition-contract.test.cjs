'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  { adaptClient } = require('../src/legacy/client-adapter.cjs');
const files = [
  '.test-tools/focus/deployed-oct15.swf',
  'runtime/game/resources/adaptive-contract.json',
  'runtime/game/resources/adaptive-contract-oct15.json',
];
const present = files.every((f) => fs.existsSync(f)),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561')),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function setup() {
  return {
    input: fs.readFileSync(files[0]),
    base: JSON.parse(fs.readFileSync(files[1])),
    reviewed: JSON.parse(fs.readFileSync(files[2])),
  };
}
test(
  'October 15 restores enhancements through a separate complete contract and preserves native allocation recovery',
  { skip: !present },
  () => {
    const { input, base, reviewed } = setup(),
      pin = require('../src/legacy/client-transition-oct15.json');
    assert.equal(hash(input), pin.inputHash);
    assert.equal(patchAdaptiveClient(input, base), null, 'Old contract must retain its rejection');
    for (const key of Object.keys(base))
      if (!['sourceHash', 'guards'].includes(key))
        assert.deepEqual(reviewed[key], base[key], key + ' remains fully guarded');
    assert.equal(base.guards.length, 18);
    assert.equal(reviewed.bodies.length, 31);
    const changed = reviewed.guards.filter(
      (g, n) => JSON.stringify(g) !== JSON.stringify(base.guards[n])
    );
    assert.equal(changed.length, 1);
    assert.equal(changed[0].name, pin.method);
    assert.equal(changed[0].hash, pin.bodyHash);
    const result = adaptClient(input, pin.url, { multiplayer: [base, reviewed] });
    assert(result.patched && result.audio);
    assert.equal(result.mode, 'contract');
    const before = readSWF(input),
      after = readSWF(result.patched),
      a = main(before).abc,
      b = main(after).abc,
      edited = new Set(reviewed.bodies.map((x) => x.id));
    assert(a.interfaceContract.equals(b.interfaceContract));
    assert(b.prefix.subarray(b.poolEnd).equals(a.prefix.subarray(a.poolEnd)));
    for (const body of a.bodies)
      if (!edited.has(body.id))
        assert(
          body.bytes.equals(b.bodies.find((x) => x.id === body.id).bytes),
          'Preserve full ' + body.name + ' #' + body.id
        );
    for (const tag of before.tags)
      if (tag !== main(before)) assert(after.tags.some((t) => t.raw.equals(tag.raw)));
    assert.equal(
      hash(b.bodies.find((x) => x.name === pin.method).bytes),
      pin.bodyHash,
      'Exception envelope survives byte-identically'
    );
    const local = JSON.parse(
      fs.readFileSync('runtime/game/resources/adaptive-contract-singleplayer.json')
    );
    assert.deepEqual(
      adaptClient(input, pin.url, { multiplayer: [base, reviewed], singleplayer: local }),
      result
    );
    const localInput = fs.readFileSync('.test-tools/focus/singleplayer.swf');
    assert.deepEqual(
      adaptClient(localInput, 'http://localhost:8000/', {
        multiplayer: [base, reviewed],
        singleplayer: local,
      }),
      adaptClient(localInput, 'http://localhost:8000/', { multiplayer: base, singleplayer: local }),
      'Both multiplayer recipes leave reviewed local output unchanged'
    );
    assert.equal(
      adaptClient(localInput, pin.url, { multiplayer: [base, reviewed], singleplayer: local })
        .patched,
      null,
      'No local adapter on a multiplayer origin'
    );
  }
);
test(
  'new contract rejects changed allocation, input, rendering and audio dependencies instead of guessing',
  { skip: !present },
  () => {
    const { input, base, reviewed } = setup();
    for (const name of [
      'Game.method_1947',
      'Game.method_1880',
      'Main.method_561',
      'Camera.method_1073',
      'SoundManager.Play',
    ]) {
      const swf = readSWF(input),
        tag = main(swf),
        abc = tag.abc,
        body = abc.bodies.find((b) => b.name === name),
        bytes = Buffer.from(body.bytes);
      bytes[body.codeOffset] ^= 1;
      const data = Buffer.concat([
          tag.lead,
          abc.prefix,
          ...abc.bodies.map((b) => (b === body ? bytes : b.bytes)),
        ]),
        changed = writeSWF(
          swf,
          swf.tags.map((t) => (t === tag ? encodeTag(82, data) : t.raw))
        );
      assert.equal(
        adaptClient(changed, 'https://dungeonblitzr.theminesa.studio/', {
          multiplayer: [base, reviewed],
        }).patched,
        null,
        name
      );
    }
  }
);
