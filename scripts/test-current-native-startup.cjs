'use strict';
// Real admitted public client, empty memory storage and denied game TCP.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(process.argv[2]);
if (path.basename(runtime) !== 'ruffle_desktop.exe' || !fs.existsSync(runtime))
  throw Error('Pass the verified independent native fixture runtime');
(async () => {
  require('../research/gpu/background.cjs').lowerSelf();
  const out = fs.mkdtempSync(path.join(root, 'artifacts/current-native-startup-'));
  const origin = process.argv[3] || 'https://dungeonblitzr.theminesa.studio/';
  const resource = await require('../src/native-player-resources.cjs').prepare(
    path.join(root, 'runtime'),
    origin,
    AbortSignal.timeout(90000),
    path.join(out, 'public-assets')
  );
  try {
    assert.equal(resource.evidence.artwork.length, 73);
    fs.writeFileSync(path.join(out, 'admission.json'), JSON.stringify(resource.evidence, null, 2));
    await require('./native-player-fixture.cjs').privateRunAsync(
      {
        root,
        out,
        assets: [],
        movieURL: resource.movieURL,
        sourceURL: resource.sourceURL,
        hosted: true,
        production: true,
        frameRate: 120,
        runtimeBudgetMs: 120000,
        capture: true,
        runtime,
      },
      async ({ rpc, delay, config, host }) => {
        const assert = require('node:assert/strict');
        host.send({ type: 'viewport', width: 1600, height: 900 });
        host.send({ type: 'visibility', value: true });
        let state;
        for (let i = 0; i < 100; i++) {
          state = await rpc('BlitzRenderState');
          if (state?.presentation?.games?.length) break;
          await delay(250);
        }
        assert(
          state?.stageWidth > 0 && state.presentation?.games?.length,
          'Actual client presentation helper must attach to a Game'
        );
        await delay(16000);
        let renders = [];
        for (let i = 0; i < 80; i++) {
          renders = host.events
            .filter((e) => e.type === 'native-status')
            .map((e) => e.value.renderFPS);
          if (renders.length > 10 && renders.slice(-10, -2).every((n) => n >= 118 && n < 123))
            break;
          await delay(1000);
        }
        require('node:fs').writeFileSync(
          require('node:path').join(config.out, 'steady-render-samples.json'),
          JSON.stringify({ samples: renders, captureNotStarted: true }, null, 2)
        );
        assert(
          renders.length > 10 && renders.slice(-10, -2).every((n) => n >= 118 && n < 123),
          'Completed title renders must sustain the 120 cap after warmup'
        );
        assert.equal(await rpc('BlitzFixtureCapture', [1]), true);
        host.send({
          type: 'audio-mix',
          value: { player: 25, music: 50, environment: 75, creatures: 100 },
        });
        await delay(150);
        const audio = await rpc('BlitzAudioState');
        assert.deepEqual(audio.levels, {
          player: 0.25,
          music: 0.5,
          environment: 0.75,
          creatures: 1,
        });
        assert.equal(await rpc('BlitzFixtureResize', [1280, 720]), true);
        await delay(500);
        const resized = await rpc('BlitzRenderState');
        assert.equal(resized.stageWidth, 1280);
        assert.equal(resized.stageHeight, 720);
        assert.equal(await rpc('BlitzFixtureCapture', [2]), true);
        return {
          state,
          resized,
          renders,
          audio,
          scope:
            'Actual current client, empty memory storage, TCP denied, no account/gameplay or OS input.',
        };
      },
      {
        BLITZ_NATIVE_RESOURCE_BROKER: resource.brokerURL,
        BLITZ_NATIVE_RESOURCE_ORIGIN: resource.origin,
        BLITZ_NATIVE_RESOURCE_TOKEN: resource.token,
      }
    );
  } finally {
    resource.close();
  }
  console.log(out);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
