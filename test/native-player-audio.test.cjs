'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { paths, isMp3, createAudioCache } = require('../src/native-player-audio.cjs');
function audio() {
  const b = Buffer.alloc(834);
  for (const at of [0, 417]) Buffer.from([255, 251, 144, 0]).copy(b, at);
  return b;
}
test('Public audio permits only reviewed filenames and bounded MP3 frames', async () => {
  const bytes = audio();
  assert(isMp3(bytes));
  for (const b of [
    Buffer.from('<html>not music</html>'),
    Buffer.from('CWS\x10malicious movie'),
    bytes.subarray(0, 700),
    Buffer.alloc(8 * 1024 * 1024 + 1),
    Buffer.from('ID3\x04\x00\x00\xff\xff\xff\xff'),
  ])
    assert(!isMp3(b));
  let calls = 0;
  const cache = createAudioCache(async () => {
    calls++;
    return bytes;
  });
  for (const p of [
    '/p/mp3/../accounts.json',
    'https://example.com/a.mp3',
    paths[0] + '?secret=1',
    '/p/mp3/unknown.mp3',
  ])
    await assert.rejects(cache.load(p), /path rejected/);
  assert.equal(calls, 0);
  assert.strictEqual(await cache.load(paths[0]), bytes);
  assert.strictEqual(await cache.load(paths[0]), bytes);
  assert.equal(calls, 1);
  cache.close();
  await assert.rejects(cache.load(paths[0]), /rejected/);
});
test('Public audio coalesces requests, limits concurrency and evicts old cache entries', async () => {
  let calls = 0,
    active = 0,
    peak = 0;
  const bytes = audio();
  const cache = createAudioCache(async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return bytes;
  });
  await Promise.all(paths.slice(0, 8).flatMap((p) => [cache.load(p), cache.load(p)]));
  assert.equal(calls, 8);
  assert.equal(peak, 2);
  for (const p of paths.slice(8, 70)) await cache.load(p);
  assert.equal(calls, 70);
  await cache.load(paths[69]);
  assert.equal(calls, 70);
  await cache.load(paths[0]);
  assert.equal(calls, 71);
  cache.close();
});
test('Closing audio rejects queued work; invalid media is never cached', async () => {
  const releases = [];
  let calls = 0;
  const cache = createAudioCache(() => {
    calls++;
    return new Promise((r) => releases.push(r));
  });
  const work = paths.slice(0, 5).map((p) => cache.load(p));
  cache.close();
  releases.forEach((r) => r(audio()));
  assert((await Promise.allSettled(work)).every((r) => r.status === 'rejected'));
  assert.equal(calls, 2);
  let badCalls = 0;
  const bad = createAudioCache(async () => {
    badCalls++;
    return Buffer.from('not MP3');
  });
  for (let i = 0; i < 2; i++) await assert.rejects(bad.load(paths[0]), /Invalid/);
  assert.equal(badCalls, 2);
  bad.close();
});
