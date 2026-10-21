'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { adaptClient } = require('../src/legacy/client-adapter.cjs');
const source = '.test-tools/focus/deployed-oct19.swf',
  names = [
    'adaptive-contract',
    'adaptive-contract-oct15',
    'adaptive-contract-oct16',
    'adaptive-contract-oct17',
    'adaptive-contract-recovery-oct17',
    'adaptive-contract-map-oct19',
  ],
  files = names.map((n) => 'runtime/game/resources/' + n + '.json');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
test(
  'October 19 map adapter retains complete recovery/cleanup and all unrelated methods and tags',
  { skip: !fs.existsSync(source) || !files.every((f) => fs.existsSync(f)) },
  () => {
    const input = fs.readFileSync(source),
      pin = require('../src/legacy/client-map-recovery-oct19.json'),
      recipes = files.map((f) => JSON.parse(fs.readFileSync(f))),
      recipe = recipes.at(-1),
      base = recipes.at(-2);
    assert.equal(hash(input), pin.inputHash);
    assert.equal(adaptClient(input, pin.url, { multiplayer: recipes.slice(0, -1) }).patched, null);
    for (const key of Object.keys(recipe))
      if (!['sourceHash', 'bodies'].includes(key)) assert.deepEqual(recipe[key], base[key]);
    assert.deepEqual(
      recipe.bodies
        .filter((b, i) => JSON.stringify(b) !== JSON.stringify(base.bodies[i]))
        .map((b) => b.name),
      [pin.method]
    );
    const result = adaptClient(input, pin.url, { multiplayer: recipes });
    assert(result.patched && result.audio);
    const before = readSWF(input),
      after = readSWF(result.patched),
      abc = main(before).abc,
      out = main(after).abc,
      edited = new Set(recipe.bodies.map((b) => b.id));
    for (const b of abc.bodies)
      if (!edited.has(b.id))
        assert(b.bytes.equals(out.bodies.find((o) => o.id === b.id).bytes), b.name);
    for (const t of before.tags)
      if (t !== main(before)) assert(after.tags.some((o) => o.raw.equals(t.raw)));
    const body = abc.bodies.find((b) => b.name === pin.method),
      patched = out.bodies.find((b) => b.id === body.id),
      start = body.codeOffset + pin.offset;
    assert.equal(hash(body.bytes), pin.bodyHash);
    assert(body.bytes.subarray(0, start).equals(patched.bytes.subarray(0, start)));
    assert(
      body.bytes.subarray(start + 6).equals(patched.bytes.subarray(start + 6)),
      'Exception table and entire cleanup handler retained'
    );
    assert.equal(patched.bytes.subarray(start, start + 6).toString('hex'), '258009020202');
    const changed = Buffer.from(body.bytes);
    changed[changed.length - 2] ^= 1;
    const t = main(before),
      data = Buffer.concat([
        t.lead,
        abc.prefix,
        ...abc.bodies.map((b) => (b.id === body.id ? changed : b.bytes)),
      ]),
      bad = writeSWF(
        before,
        before.tags.map((o) => (o === t ? encodeTag(82, data) : o.raw))
      );
    assert.equal(adaptClient(bad, pin.url, { multiplayer: recipes }).patched, null);
    const local = JSON.parse(
        fs.readFileSync('runtime/game/resources/adaptive-contract-singleplayer.json')
      ),
      localBytes = fs.readFileSync('.test-tools/focus/singleplayer.swf');
    assert.deepEqual(
      adaptClient(localBytes, 'http://localhost:8000/', {
        multiplayer: recipes,
        singleplayer: local,
      }),
      adaptClient(localBytes, 'http://localhost:8000/', {
        multiplayer: recipes.slice(0, -1),
        singleplayer: local,
      })
    );
  }
);

test(
  'October 19 evening revision reuses guarded recipe and preserves every new native method/tag',
  {
    skip:
      !fs.existsSync('.test-tools/focus/deployed-evening-oct19.swf') ||
      !files.every((f) => fs.existsSync(f)),
  },
  () => {
    const input = fs.readFileSync('.test-tools/focus/deployed-evening-oct19.swf');
    assert.equal(hash(input), 'bb6410470881b5a13c3899e09ae38f49aff41b3c5d9fe396c57cc5c72afe3d89');
    const recipes = files.map((f) => JSON.parse(fs.readFileSync(f))),
      result = adaptClient(input, 'https://dungeonblitzr.theminesa.studio/', {
        multiplayer: recipes,
      });
    assert(result.patched && result.audio);
    const before = readSWF(input),
      after = readSWF(result.patched),
      abc = main(before).abc,
      out = main(after).abc,
      edited = new Set(recipes.at(-1).bodies.map((b) => b.id));
    for (const b of abc.bodies)
      if (!edited.has(b.id))
        assert(b.bytes.equals(out.bodies.find((v) => v.id === b.id).bytes), b.name);
    for (const t of before.tags)
      if (t !== main(before)) assert(after.tags.some((v) => v.raw.equals(t.raw)));
    for (const name of [
      'Level.method_506',
      'class_105.method_1421',
      'class_69.OnTickScreen',
      'CombatState.method_522',
    ])
      assert(!edited.has(abc.bodies.find((b) => b.name === name).id), name);
  }
);
