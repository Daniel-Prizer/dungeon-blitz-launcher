const { test } = require('node:test'),
  assert = require('node:assert/strict');
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const packet = (sequence = 1, revision = 1) => ({
  protocol: 1,
  supported: true,
  worldOnly: true,
  requiresAssetContract: true,
  epoch: 'room',
  sequence,
  width: 128,
  height: 128,
  clear: [0, 0, 0, 1],
  activeArt: [{ id: 'b1', revision, width: 1, height: 1 }],
  art: [{ id: 'b1', revision, width: 1, height: 1, png }],
  nodes: [
    {
      id: 'actor',
      textureId: 'b1',
      matrix: [1, 0, 0, 1, 0, 0],
      size: [1, 1],
      tint: [1, 1, 1, 1],
      offset: [0, 0, 0, 0],
      clip: [0, 0, 128, 128],
      blend: 'normal',
      interpolate: true,
    },
  ],
});
test('native scene admission requires asset provenance and rejects missing or contradictory draws', async () => {
  const { inspectNativePacket } = await import('../src/gpu/native-packet.mjs');
  assert.throws(() => inspectNativePacket(packet()), /unverified/);
  for (const edit of [
    (p) => (p.nodes[0].textureId = 'b2'),
    (p) => p.nodes.push(p.nodes[0]),
    (p) => (p.art[0].revision = 2),
    (p) => (p.nodes[0].size = [2, 1]),
    (p) => (p.nodes[0].mask = 'ignored'),
    (p) => (p.activeArt[0].width = 8192),
    (p) => (p.art[0].png = 'bad'),
  ]) {
    const p = packet();
    edit(p);
    assert.throws(() => inspectNativePacket(p, { assetContractVerified: true }));
  }
});
test('native texture revisions remain immutable while retained scenes use them, then safely recycle', async () => {
  const { NativeTextureLedger } = await import('../src/gpu/native-packet.mjs'),
    ledger = new NativeTextureLedger(),
    options = { assetContractVerified: true };
  let plan = ledger.prepare(packet(), options);
  assert.equal(plan.append[0].index, 0);
  assert.deepEqual(ledger.known, []);
  ledger.commit(plan);
  plan = ledger.prepare(packet(2, 2), { ...options, retainedIndices: new Set([0]) });
  assert.equal(plan.append[0].index, 1);
  ledger.commit(plan);
  plan = ledger.prepare(packet(3, 3), { ...options, retainedIndices: new Set([1]) });
  assert.equal(plan.reuse[0].index, 0);
  assert.equal(plan.append.length, 0);
  assert.deepEqual(ledger.known, [{ id: 'b1', revision: 2 }]);
  ledger.cancel(plan);
  assert.equal(ledger.sequence, 2);
  const retry = ledger.prepare(packet(3, 3), { ...options, retainedIndices: new Set([1]) });
  ledger.commit(retry);
  assert.equal(ledger.slots.length, 2);
  assert.deepEqual(ledger.known, [{ id: 'b1', revision: 3 }]);
});
test('failed native transactions cannot acknowledge missing textures or commit stale plans', async () => {
  const { NativeTextureLedger } = await import('../src/gpu/native-packet.mjs'),
    ledger = new NativeTextureLedger(),
    options = { assetContractVerified: true };
  const p = packet();
  p.art = [];
  assert.throws(() => ledger.prepare(p, options), /acknowledged/);
  let plan = ledger.prepare(packet(), options);
  assert.throws(() => ledger.prepare(packet(2, 2), options), /pending/);
  ledger.cancel(plan);
  assert.throws(() => ledger.commit(plan), /Invalid/);
  plan = ledger.prepare(packet(), options);
  ledger.commit(plan);
  assert.throws(() => ledger.prepare(packet(), options), /Out-of-order/);
});
test('native bulk-byte decoder rejects malformed escapes, truncation and nonzero padding', async () => {
  const { nativeBytes } = await import('../src/gpu/binary.mjs');
  assert.deepEqual(
    [...new Uint8Array(nativeBytes('%uFF00%uD800%uE000%01', 7))],
    [0, 255, 0, 216, 0, 224, 1]
  );
  for (const [s, n] of [
    ['%u00', 2],
    ['%GG', 1],
    ['A', 3],
    ['%u0101', 1],
    ['%00', 3],
    ['', 1],
  ])
    assert.throws(() => nativeBytes(s, n));
});
test('bulk artwork decoding is bounded and roundtrips every UTF16 word and multi-megabyte payloads without a regex stack', async () => {
  const { nativeBytes } = await import('../src/gpu/binary.mjs');
  const all = Array.from({ length: 65536 }, (_, i) => '%u' + i.toString(16).padStart(4, '0')).join(
      ''
    ),
    data = new DataView(nativeBytes(all, 131072));
  for (let i = 0; i < 65536; i++) assert.equal(data.getUint16(i * 2, true), i);
  const large = new Uint8Array(nativeBytes('%u1234'.repeat(1024 * 1024), 2 * 1024 * 1024));
  assert.equal(large.length, 2 * 1024 * 1024);
  assert.equal(large[large.length - 2], 0x34);
  assert.equal(large[large.length - 1], 0x12);
  assert.throws(() => nativeBytes('%u1234'.repeat(1000) + '%', 2001));
});
test('inactive native poses stay acknowledged until a free slot must be recycled', async () => {
  const { NativeTextureLedger } = await import('../src/gpu/native-packet.mjs'),
    ledger = new NativeTextureLedger(),
    options = { assetContractVerified: true };
  ledger.commit(ledger.prepare(packet(), options));
  const next = packet(2);
  next.activeArt[0].id = 'b2';
  next.art[0].id = 'b2';
  next.nodes[0].textureId = 'b2';
  ledger.commit(ledger.prepare(next, { ...options, retainedIndices: new Set([0]) }));
  assert.equal(ledger.known.length, 2);
  const returning = packet(3);
  returning.art = [];
  const plan = ledger.prepare(returning, options);
  assert.equal(plan.append.length, 0);
  assert.equal(plan.reuse.length, 0);
  ledger.commit(plan);
  assert.equal(ledger.known.length, 2);
  const reset = packet(4);
  reset.epoch = 'next-room';
  const replacement = ledger.prepare(reset, options);
  assert.equal(replacement.slots.length, 1);
  assert.equal(replacement.append[0].index, 0);
});
