'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { prepare, manifestFiles, levelFiles } = require('../src/native-player-resources.cjs');
const { validSettings } = require('../src/policy.cjs');
const { NativePlayerRuntime } = require('../src/native-player-runtime.cjs');

test('Native Save applies the saved crosshair without replacing the runtime or preferences', () => {
  const runtime = Object.create(NativePlayerRuntime.prototype);
  Object.assign(runtime, { nativePlayer: true, pending: [] });
  const saved = validSettings({
    crosshair: { style: 'ring', color: '#ff8000', size: 32, outline: false },
    renderResolution: 0.5,
  });
  const before = structuredClone(saved);
  runtime.configure(saved);
  assert.deepEqual(saved, before);
  assert.equal(runtime.settings.renderResolution, 1);
  assert.deepEqual(runtime.settings.crosshair, saved.crosshair);
  assert.deepEqual(
    runtime.pending.map(JSON.parse).find((v) => v.type === 'crosshair').value,
    saved.crosshair
  );
  runtime.pending.length = 0;
  runtime.configure(saved);
  assert.equal(runtime.pending.length, 0);
  saved.crosshair.style = 'dot';
  runtime.configure(saved);
  assert.deepEqual(runtime.pending.map(JSON.parse), [
    { type: 'crosshair', value: saved.crosshair },
  ]);
});
test('120 FPS is an opt-in renderer and does not change the existing cap or defaults', () => {
  assert.equal(validSettings().gameRenderer, 'original');
  const saved = validSettings({ gameRenderer: 'native', gpuFrameCap: 480, renderResolution: 0.5 });
  assert.equal(saved.gameRenderer, 'native');
  assert.equal(saved.gpuFrameCap, 480);
  assert.equal(saved.renderResolution, 0.5);
});
test('Native resources reject custom servers before network or filesystem access', async () => {
  for (const address of [
    'http://localhost:8080/',
    'https://example.com/',
    'https://dungeonblitzr.theminesa.studio.evil/',
  ])
    await assert.rejects(prepare('missing-runtime', address), /official multiplayer/);
});
test('An unqualified client is rejected before adapters, cache or resource broker are opened', async () => {
  const prior = global.fetch,
    requests = [];
  try {
    global.fetch = async (url) => {
      requests.push(String(url));
      const body =
        requests.length === 1
          ? 'const swfUrl = `/p/cbp/DungeonBlitz.swf?fv=cbp&gv=cbp&clientrev=swf-abcdef`;'
          : 'unqualified client';
      return {
        ok: true,
        headers: { get: () => null },
        body: (async function* () {
          yield Buffer.from(body);
        })(),
      };
    };
    await assert.rejects(
      prepare('nonexistent-runtime', 'https://dungeonblitzr.theminesa.studio/'),
      /not been qualified/
    );
    assert.equal(requests.length, 2);
    assert(requests.every((url) => url.startsWith('https://dungeonblitzr.theminesa.studio/')));
  } finally {
    global.fetch = prior;
  }
});
test('Native public manifest parser rejects traversal and unexpected resource types', () => {
  assert.deepEqual(manifestFiles('<File Name="UI_0.swf" Version="cbp"/>'), [
    { name: 'UI_0.swf', pathname: '/p/cbp/UI_0.swf', stage: undefined },
  ]);
  for (const name of ['../saves.xml', 'https://evil/a.swf', 'Account.json', 'a.exe', 'a.swf?x'])
    assert.throws(() => manifestFiles(`<File Name="${name}" Version="cbp"/>`));
  assert.throws(() => manifestFiles(''));
});
test('Native level resources require the complete reviewed inventory and exact paths', () => {
  const known = [{ name: 'LevelsBT.swf', path: '/p/cam/LevelsBT.swf' }];
  assert.deepEqual(levelFiles(known, ['LevelsBT.swf']), [
    { name: 'LevelsBT.swf', pathname: '/p/cam/LevelsBT.swf' },
  ]);
  for (const names of [
    [],
    ['LevelsUnknown.swf'],
    ['LevelsBT.swf', 'LevelsBT.swf'],
    ['../LevelsBT.swf'],
  ])
    assert.throws(() => levelFiles(known, names));
  for (const pathname of [
    '/p/cam/../LevelsBT.swf',
    '/p/cam/LevelsHome.swf',
    'https://other/LevelsBT.swf',
  ])
    assert.throws(() => levelFiles([{ ...known[0], path: pathname }], ['LevelsBT.swf']));
  assert.throws(() => levelFiles([...known, ...known], ['LevelsBT.swf']));
  const admission = require('../src/native-player-admission.json');
  const levels = levelFiles(require('../src/gpu/assets.json').assets, admission.levels);
  assert.equal(levels.length, 21);
});
