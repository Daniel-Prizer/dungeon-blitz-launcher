'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { prepare, manifestFiles } = require('../src/native-player-resources.cjs');
const { validSettings } = require('../src/policy.cjs');
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
