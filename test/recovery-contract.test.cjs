'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const { readSWF, writeSWF, encodeTag } = require('../src/legacy/swf-contract.cjs'),
  { adaptClient } = require('../src/legacy/client-adapter.cjs');
const files = [
  'adaptive-contract',
  'adaptive-contract-oct15',
  'adaptive-contract-oct16',
  'adaptive-contract-oct17',
  'adaptive-contract-recovery-oct17',
].map((n) => 'runtime/game/resources/' + n + '.json');
const source = '.test-tools/recovery-contract/source.swf',
  present = fs.existsSync(source) && files.every((f) => fs.existsSync(f)),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
function exceptions(body) {
  let pos = body.codeOffset + body.code.length;
  const u = () => {
    let n = 0,
      s = 0,
      b;
    do {
      b = body.bytes[pos++];
      n += (b & 127) * 2 ** s;
      s += 7;
    } while (b & 128);
    return n;
  };
  return Array.from({ length: u() }, () => Array.from({ length: 5 }, u));
}
test(
  'recovery contract preserves native handlers, terrain healing and every unrelated game method',
  { skip: !present },
  () => {
    const input = fs.readFileSync(source),
      pin = require('../src/legacy/client-recovery-oct17.json'),
      recipes = files.map((f) => JSON.parse(fs.readFileSync(f))),
      base = recipes[3],
      recipe = recipes[4];
    assert.equal(hash(input), pin.inputHash);
    assert.equal(adaptClient(input, pin.url, { multiplayer: recipes.slice(0, 4) }).patched, null);
    for (const key of Object.keys(recipe))
      if (!['sourceHash', 'bodies'].includes(key)) assert.deepEqual(recipe[key], base[key]);
    assert.deepEqual(
      recipe.bodies
        .filter((b, i) => JSON.stringify(b) !== JSON.stringify(base.bodies[i]))
        .map((b) => b.name)
        .sort(),
      pin.methods.map((p) => p.name).sort()
    );
    const result = adaptClient(input, pin.url, { multiplayer: recipes });
    assert(result.patched && result.audio);
    assert.equal(result.mode, 'contract');
    const before = readSWF(input),
      after = readSWF(result.patched),
      abc = main(before).abc,
      out = main(after).abc,
      edited = new Set(recipe.bodies.map((b) => b.id));
    for (const b of abc.bodies)
      if (!edited.has(b.id))
        assert(b.bytes.equals(out.bodies.find((a) => a.id === b.id).bytes), b.name);
    for (const tag of before.tags)
      if (tag !== main(before)) assert(after.tags.some((t) => t.raw.equals(tag.raw)));
    for (const p of pin.methods) {
      const a = abc.bodies.find((b) => b.name === p.name),
        b = out.bodies.find((b) => b.id === a.id);
      assert.equal(hash(a.bytes), p.bodyHash);
      if (p.name === 'Main.method_561') {
        assert.deepEqual(exceptions(a), [[327, 367, 595, 0, 0]]);
        assert.deepEqual(exceptions(b), [[327, 367, 601, 0, 0]]);
        assert.equal(b.code.subarray(440, 446).toString('hex'), '6209d5620ad6');
        const normalized = Buffer.concat([b.code.subarray(0, 440), b.code.subarray(446)]);
        for (const [start, end] of [
          [2, 56],
          [218, 220],
          [508, 512],
          [522, 526],
          [598, 602],
        ])
          a.code.copy(normalized, start, start, end);
        assert(
          normalized.equals(a.code),
          'Only reviewed layout expressions, stage restore and relocated handler branch change'
        );
        assert.equal(b.code[604], 0x10);
        assert.equal(608 + b.code.readIntLE(605, 3), 367, 'Catch returns to native cleanup');
      } else {
        assert.deepEqual(exceptions(b), exceptions(a));
        const start = p.name === 'Game.method_1946' ? 4 : 321,
          end = p.name === 'Game.method_1946' ? 21 : 335;
        assert(b.code.subarray(0, start).equals(a.code.subarray(0, start)));
        assert(b.code.subarray(end).equals(a.code.subarray(end)));
      }
      const changed = Buffer.from(a.bytes);
      changed[a.codeOffset] ^= 1;
      const t = main(before),
        data = Buffer.concat([
          t.lead,
          abc.prefix,
          ...abc.bodies.map((body) => (body.id === a.id ? changed : body.bytes)),
        ]),
        tampered = writeSWF(
          before,
          before.tags.map((tag) => (tag === t ? encodeTag(82, data) : tag.raw))
        );
      assert.equal(
        adaptClient(tampered, pin.url, { multiplayer: recipes }).patched,
        null,
        'Reject altered ' + p.name
      );
    }
    const local = JSON.parse(
        fs.readFileSync('runtime/game/resources/adaptive-contract-singleplayer.json')
      ),
      localInput = fs.readFileSync('.test-tools/focus/singleplayer.swf');
    assert.deepEqual(
      adaptClient(localInput, 'http://localhost:8000/', {
        multiplayer: recipes,
        singleplayer: local,
      }),
      adaptClient(localInput, 'http://localhost:8000/', {
        multiplayer: recipes.slice(0, 4),
        singleplayer: local,
      })
    );
  }
);
