'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = process.cwd();
require('../research/gpu/background.cjs').lowerSelf();
const [stub, runtime] = process.argv.slice(2).map((p) => path.resolve(p));
if (
  !stub ||
  !runtime ||
  !fs.existsSync(stub) ||
  !fs.existsSync(runtime) ||
  path.basename(runtime) !== 'ruffle_desktop.exe'
)
  throw Error('Pass the guarded offline SWF stub and unbranded owned native runtime');
const out = fs.mkdtempSync(path.join(root, 'artifacts/native-settings-')),
  scripts = path.join(out, 'as');
fs.mkdirSync(scripts);
fs.copyFileSync(
  'test/native-settings-fixture/DungeonBlitz.as',
  path.join(scripts, 'DungeonBlitz.as')
);
execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-jar',
    path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
    '-importScript',
    stub,
    path.join(out, 'fixture.swf'),
    scripts,
  ],
  { windowsHide: true, stdio: 'inherit', timeout: 120000 }
);
require('./native-player-fixture.cjs').privateRun(
  {
    root,
    out,
    assets: ['UI_0.swf'],
    hosted: true,
    production: true,
    frameRate: 120,
    capture: true,
    runtime,
  },
  async ({ rpc, delay, host, config }) => {
    const assert = require('node:assert/strict'),
      fs = require('node:fs'),
      path = require('node:path'),
      { pixels } = require(path.join(config.root, 'src/crosshair.js'));
    const checks = [],
      cursorImages = [];
    const view = () => rpc('BlitzRenderState');
    const wait = async (fn) => {
      for (let i = 0; i < 80; i++) {
        if (await fn()) return;
        await delay(50);
      }
      throw Error('Setting did not apply to the running fixture');
    };
    await wait(async () => (await rpc('BlitzSettingsFixtureReady')) === true);
    host.send({ type: 'visibility', value: true });
    for (const style of ['cross', 'dot', 'ring', 'original', 'default']) {
      const value = { style, color: '#ff8000', size: 32, outline: true };
      host.send({ type: 'crosshair', value });
      let state;
      await wait(async () => {
        state = JSON.parse(await rpc('BlitzFixtureCursor'));
        return state.style === style && state.applied === state.custom;
      });
      assert.equal(state.dryRun, true);
      assert.equal(state.custom, style !== 'default');
      if (['cross', 'dot', 'ring'].includes(style)) {
        const expected = pixels(value);
        assert.equal(state.width, expected.width);
        assert.deepEqual(state.hotspot, [expected.hotspot, expected.hotspot]);
        assert.deepEqual(state.rgba, Array.from(expected.rgba));
      }
      if (style === 'original')
        assert(
          state.rgba.some((v, i) => i % 4 === 3 && v > 0),
          'Original recoloring retains alpha'
        );
      if (style === 'default') {
        assert.equal(state.width, 0);
        assert.equal(state.rgba.length, 0);
      } else cursorImages.push(state);
    }
    checks.push(
      'Every pointer style applies through the production pipe without restart; generated pixels match Original, with retained alpha and hotspot'
    );
    host.send({
      type: 'crosshair',
      value: { style: 'ring', color: '#ff8000', size: 32, outline: true },
    });
    await rpc('BlitzSettingsFixtureCursor', ['ibeam']);
    await wait(async () => JSON.parse(await rpc('BlitzFixtureCursor')).applied === false);
    await rpc('BlitzSettingsFixtureCursor', ['button']);
    await wait(async () => JSON.parse(await rpc('BlitzFixtureCursor')).applied === true);
    checks.push(
      'Text fields keep their native cursor; returning to the game restores the crosshair'
    );
    const settings = [
      { type: 'zoom', value: 1.25 },
      { type: 'widescreen', value: true },
      { type: 'centered-hotbar', value: true },
      { type: 'centered-camera', value: true },
      { type: 'show-fps', value: true },
      { type: 'audio-mix', value: { player: 25, music: 50, environment: 75, creatures: 0 } },
    ];
    for (const command of settings) host.send(command);
    const correct = async () => {
      const v = await view(),
        a = await rpc('BlitzAudioState');
      return (
        v.zoom === 1.25 &&
        v.centeredCamera &&
        v.widescreen.requested &&
        v.widescreen.centeredHotbar &&
        v.frameCounter.shown &&
        a.levels.player === 0.25 &&
        a.levels.music === 0.5 &&
        a.levels.environment === 0.75 &&
        a.levels.creatures === 0
      );
    };
    await wait(correct);
    const generations = [];
    for (let i = 0; i < 3; i++) {
      generations.push(await rpc('BlitzSettingsGeneration'));
      assert.equal(await rpc('BlitzSettingsFixtureReset'), true);
      await wait(correct);
      assert((await rpc('BlitzSettingsGeneration')) > generations.at(-1));
    }
    checks.push(
      'Saved zoom, counter, layout, camera and audio restored after three new Game sessions without reconnect or settings edits'
    );
    host.send({ type: 'zoom', value: 0.75 });
    await wait(async () => (await view()).zoom === 0.75);
    checks.push('A later Save replaces the retained value immediately');
    const animationRate = (await view()).animationRate;
    const densities = [];
    for (const value of [0.75, 0.5, 1]) {
      host.send({ type: 'render-resolution', value });
      await wait(async () => Math.abs((await view()).stageWidth - 1600 * value) < 1);
      const v = await view();
      assert.equal(v.zoom, 0.75);
      assert.equal(v.stageHeight, 900 * value);
      densities.push({
        value,
        width: v.stageWidth,
        height: v.stageHeight,
        bitmapWidth: v.bitmapWidth,
      });
    }
    host.send({ type: 'frame-cap', value: 240 });
    await wait(async () =>
      host.events.some((e) => e.type === 'native-status' && e.value.cap === 240)
    );
    assert.equal((await view()).animationRate, animationRate);
    await rpc('BlitzFixtureCapture', [1]);
    checks.push(
      'Live raster density preserves picture zoom, restores full geometry and a new cap leaves the requested animation clock unchanged'
    );
    for (const name of ['LevelsBT.swf', 'LevelsTut.swf', 'LevelsBT.swf']) {
      await rpc('BlitzSettingsFixtureLevel', [name]);
      await wait(async () => (await view()).widescreen.active === (name !== 'LevelsTut.swf'));
      const state = await view();
      assert.equal(state.widescreen.logicalWidth, name === 'LevelsTut.swf' ? 1152 : (768 * 16) / 9);
      assert.equal(state.widescreen.requested, true);
    }
    checks.push(
      'The tutorial retains its authored 3:2 width; leaving it restores the saved widescreen view'
    );
    fs.writeFileSync(path.join(config.out, 'cursor-artwork.json'), JSON.stringify(cursorImages));
    return {
      checks,
      generations,
      densities,
      final: await view(),
      scope:
        'Production host commands and real launcher helpers, synthetic account-free Game replacement. Cursor application is dry-run; no OS input, global cursor APIs or human session access.',
    };
  }
);
