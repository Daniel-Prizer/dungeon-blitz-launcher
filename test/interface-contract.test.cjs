'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  { adaptClient } = require('../src/legacy/client-adapter.cjs');
const paths = [
    '.test-tools/focus/deployed-oct16.swf',
    ...[
      'adaptive-contract',
      'adaptive-contract-oct15',
      'adaptive-contract-oct16',
      'adaptive-contract-singleplayer',
    ].map((n) => 'runtime/game/resources/' + n + '.json'),
  ],
  present = paths.every((p) => fs.existsSync(p));
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
const setup = () => ({
  input: fs.readFileSync(paths[0]),
  recipes: paths.slice(1).map((p) => JSON.parse(fs.readFileSync(p))),
});
test(
  'October 16 contract changes only the reviewed interface pin and preserves every native update',
  { skip: !present },
  () => {
    const {
        input,
        recipes: [base, oct15, oct16, local],
      } = setup(),
      pin = require('../src/legacy/client-interface-oct16.json');
    assert.equal(hash(input), pin.inputHash);
    for (const key of Object.keys(oct15))
      if (!['sourceHash', 'interfaceHash'].includes(key))
        assert.deepEqual(oct16[key], oct15[key], key + ' unchanged');
    assert.equal(oct16.interfaceHash, pin.interfaceHash);
    assert.equal(patchAdaptiveClient(input, base), null);
    assert.equal(patchAdaptiveClient(input, oct15), null);
    const before = readSWF(input),
      abc = main(before).abc,
      normalized = JSON.parse(abc.interfaceContract);
    assert.deepEqual(normalized.classDefs[30][1][160], pin.trait);
    normalized.classDefs[30][1][160] = pin.previousTrait;
    assert.equal(hash(Buffer.from(JSON.stringify(normalized))), oct15.interfaceHash);
    const result = adaptClient(input, pin.url, {
      multiplayer: [base, oct15, oct16],
      singleplayer: local,
    });
    assert(result.patched && result.audio);
    assert.equal(result.mode, 'contract');
    const after = readSWF(result.patched),
      patched = main(after).abc,
      edited = new Set(oct16.bodies.map((b) => b.id));
    assert.equal(edited.size, 31);
    assert.equal(oct16.guards.length, 6);
    assert(patched.interfaceContract.equals(abc.interfaceContract));
    for (const body of abc.bodies)
      if (!edited.has(body.id))
        assert(
          body.bytes.equals(patched.bodies.find((b) => b.id === body.id).bytes),
          'Preserve ' + body.name
        );
    for (const tag of before.tags)
      if (tag !== main(before))
        assert(
          after.tags.some((t) => t.raw.equals(tag.raw)),
          'Preserve upstream tag ' + tag.type
        );
    for (const name of [
      'BossPrewarm.Tick',
      'HallowsEveLock.Tick',
      'CastAnimRelease.OnEnd',
      'PetSlotSync.Resync',
      'RankingsButton.Attach',
      'CofferKeys.Click',
      'EggKeep.OnNewPet',
      'BossDeathVoice.Play',
    ])
      assert(
        before.tags.some((t) => t.abc?.bodies.some((b) => b.name === name)),
        'Real new upstream ' + name
      );
    const previous = fs.readFileSync('.test-tools/focus/deployed-oct15.swf');
    assert.equal(
      patchAdaptiveClient(previous, oct16),
      null,
      'New recipe must not wildcard old interface'
    );
    assert.deepEqual(
      adaptClient(previous, pin.url, { multiplayer: [base, oct15, oct16] }),
      adaptClient(previous, pin.url, { multiplayer: [base, oct15] })
    );
    const localInput = fs.readFileSync('.test-tools/focus/singleplayer.swf');
    assert.deepEqual(
      adaptClient(localInput, 'http://localhost:8000/', {
        multiplayer: [base, oct15, oct16],
        singleplayer: local,
      }),
      adaptClient(localInput, 'http://localhost:8000/', { multiplayer: base, singleplayer: local })
    );
    assert.equal(
      adaptClient(localInput, pin.url, { multiplayer: [base, oct15, oct16], singleplayer: local })
        .patched,
      null
    );
  }
);
test(
  'October 16 still rejects changed hook envelopes, dependencies and original pool constants',
  { skip: !present },
  () => {
    const {
      input,
      recipes: [base, oct15, oct16],
    } = setup();
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
          multiplayer: [base, oct15, oct16],
        }).patched,
        null,
        name
      );
    }
    const swf = readSWF(input),
      tag = main(swf),
      prefix = Buffer.from(tag.abc.prefix);
    prefix[5] ^= 1;
    const data = Buffer.concat([tag.lead, prefix, ...tag.abc.bodies.map((b) => b.bytes)]),
      changed = writeSWF(
        swf,
        swf.tags.map((t) => (t === tag ? encodeTag(82, data) : t.raw))
      );
    assert.equal(
      patchAdaptiveClient(changed, oct16),
      null,
      'No arbitrary original constant changes'
    );
  }
);
