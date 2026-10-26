'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const {
    readSWF,
    writeSWF,
    encodeTag,
    encodePools,
    integer,
  } = require('../src/legacy/swf-contract.cjs'),
  { patchAdaptiveClient } = require('../src/legacy/adaptive-patch.cjs'),
  { publicBytes } = require('../src/game-source.cjs'),
  { makeDelta } = require('./audio-delta.cjs'),
  pin = require('../src/legacy/client-damage-oct26.json');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, '.test-tools/damage-contract-oct26'),
  recipeFile = path.join(root, 'runtime/game/resources/adaptive-contract-backdrop-oct19.json'),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  main = (s) => s.tags.find((t) => t.abc?.bodies.some((b) => b.name === 'Main.method_561'));
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const source = path.join(dir, 'source.swf');
  if (!fs.existsSync(source)) fs.writeFileSync(source, await publicBytes(pin.url, 4 * 1024 * 1024));
  const input = fs.readFileSync(source);
  assert.equal(hash(input), pin.inputHash);
  const swf = readSWF(input),
    tag = main(swf),
    abc = tag.abc,
    body = abc.bodies.find((b) => b.name === pin.method),
    recipe = JSON.parse(fs.readFileSync(recipeFile)),
    edit = recipe.bodies.find((b) => b.id === body.id && b.name === pin.method);
  assert(edit);
  assert.equal(hash(body.bytes), pin.bodyHash);
  assert.equal(hash(body.code), pin.codeHash);
  assert.equal(
    patchAdaptiveClient(input, recipe),
    null,
    'Changed hook needs its own reviewed envelope'
  );
  const map = (kind, id) =>
    id < recipe.pools[kind].count ? id : abc.pools[kind].length + id - recipe.pools[kind].count;
  const pools = {};
  for (const [kind, pool] of Object.entries(recipe.pools)) {
    assert.equal(
      hash(Buffer.from(JSON.stringify(abc.pools[kind].slice(0, pool.count)))),
      pool.inputHash
    );
    const append = pool.append.map((e) => {
      if (kind === 'namespaces') return [e[0], map('strings', e[1])];
      if (kind === 'nsSets') return e.map((i) => map('namespaces', i));
      if (kind !== 'multinames') return e;
      if ([7, 13].includes(e[0])) return [e[0], map('namespaces', e[1]), map('strings', e[2])];
      if ([15, 16].includes(e[0])) return [e[0], map('strings', e[1])];
      if ([9, 14].includes(e[0])) return [e[0], map('strings', e[1]), map('nsSets', e[2])];
      if ([27, 28].includes(e[0])) return [e[0], map('nsSets', e[1])];
      if (e[0] === 29) return [e[0], ...e.slice(1).map((i) => map('multinames', i))];
      assert([17, 18].includes(e[0]));
      return e;
    });
    pools[kind] = [...abc.pools[kind], ...append];
  }
  const augmented = path.join(dir, 'pools.swf'),
    compiled = path.join(dir, 'wrapped.swf'),
    references = path.join(dir, 'refs.json'),
    lib = path.join(root, '.test-tools/focus/ffdec/lib/*');
  const prefix = Buffer.concat([
    abc.prefix.subarray(0, 4),
    encodePools(pools),
    abc.prefix.subarray(abc.poolEnd),
  ]);
  fs.writeFileSync(
    augmented,
    writeSWF(
      swf,
      swf.tags.map((t) =>
        t === tag
          ? encodeTag(82, Buffer.concat([tag.lead, prefix, ...abc.bodies.map((b) => b.bytes)]))
          : t.raw
      )
    )
  );
  execFileSync(
    'javac',
    [
      '-cp',
      lib,
      '-d',
      dir,
      ...['AudioPatchBuilder.java', 'DamageAudioPatchBuilder.java', 'ContractReferences.java'].map(
        (n) => path.join(__dirname, n)
      ),
    ],
    { windowsHide: true, stdio: 'inherit' }
  );
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-cp',
      dir + path.delimiter + lib,
      'DamageAudioPatchBuilder',
      augmented,
      compiled,
    ],
    { windowsHide: true, stdio: 'inherit' }
  );
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-cp',
      dir + path.delimiter + lib,
      'ContractReferences',
      source,
      compiled,
      references,
    ],
    { windowsHide: true, stdio: 'inherit' }
  );
  const wrapped = main(readSWF(fs.readFileSync(compiled))).abc;
  assert.deepEqual(wrapped.pools, pools, 'No new helper dependencies');
  for (const b of abc.bodies)
    if (b.id !== body.id)
      assert(wrapped.bodies.find((p) => p.id === b.id).bytes.equals(b.bytes), b.name);
  const fixed = wrapped.bodies.find((b) => b.id === body.id),
    bytes = Buffer.from(fixed.bytes);
  const refs = JSON.parse(fs.readFileSync(references))
    .filter((r) => r.id === body.id)
    .map(({ offset, pool, index }) => {
      assert(index >= abc.pools[pool].length);
      const virtual = recipe.pools[pool].count + index - abc.pools[pool].length,
        from = integer(index),
        to = integer(virtual);
      assert.equal(from.length, to.length);
      const at = fixed.codeOffset + offset;
      assert(bytes.subarray(at, at + from.length).equals(from));
      to.copy(bytes, at);
      return { offset: at, pool, index: virtual };
    });
  assert.equal(refs.length, 12);
  assert(!edit.variants?.some((v) => v.delta.inputHash === pin.bodyHash));
  edit.variants = [
    ...(edit.variants || []),
    { delta: makeDelta(body.bytes, bytes), references: refs },
  ];
  const output = patchAdaptiveClient(input, recipe);
  assert(output, 'Complete contract passes');
  const result = main(readSWF(output)).abc;
  assert(result.bodies.find((b) => b.id === body.id).bytes.equals(fixed.bytes));
  const edited = new Set(recipe.bodies.map((b) => b.id));
  for (const b of abc.bodies)
    if (!edited.has(b.id))
      assert(result.bodies.find((p) => p.id === b.id).bytes.equals(b.bytes), b.name);
  const parsed = readSWF(output);
  for (const t of swf.tags) if (t !== tag) assert(parsed.tags.some((p) => p.raw.equals(t.raw)));
  fs.writeFileSync(recipeFile, JSON.stringify(recipe));
  console.log(
    'Prepared exact damage-audio envelope; upstream floater, combat and exception paths retained.'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
