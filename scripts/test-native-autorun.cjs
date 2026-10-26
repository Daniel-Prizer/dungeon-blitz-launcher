'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = process.cwd(),
  [stub, runtime] = process.argv.slice(2).map((p) => path.resolve(p));
if (!stub || !runtime || !fs.existsSync(stub) || path.basename(runtime) !== 'ruffle_desktop.exe')
  throw Error('Pass the reviewed offline stub and independent native runtime');
require('../research/gpu/background.cjs').lowerSelf();
const out = fs.mkdtempSync(path.join(root, 'artifacts/native-autorun-')),
  scripts = path.join(out, 'as');
fs.mkdirSync(scripts);
fs.copyFileSync('test/shortcut-fixture/DungeonBlitz.as', path.join(scripts, 'DungeonBlitz.as'));
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
  { root, out, assets: ['UI_0.swf'], hosted: true, production: true, frameRate: 120, runtime },
  async ({ rpc, delay }) => {
    const assert = require('node:assert/strict'),
      checks = [];
    const state = () => rpc('BlitzInputProbe'),
      control = (mode) => rpc('BlitzInputFixtureControl', [mode]);
    const wait = async (test) => {
      for (let i = 0; i < 100; i++) {
        if (await test()) return;
        await delay(40);
      }
      throw Error('Autorun state timed out: ' + JSON.stringify(await state()));
    };
    await wait(async () => {
      const s = await state();
      assert(!s?.error, s?.error);
      return s?.phase === 'ready';
    });
    for (const [mode, command] of [
      ['run-play', '2'],
      ['run-map', '2'],
      ['left', '1'],
      ['run-rebind', '2'],
    ]) {
      assert.equal(await control(mode), true);
      assert.equal(await rpc('BlitzAutorun'), true);
      await wait(async () => (await state()).held === command);
      for (const transition of ['run-open-map', 'run-deactivate', 'run-close-map']) {
        assert.equal(await control(transition), true);
        await wait(async () => (await state()).held === command);
        await delay(100);
        assert.equal((await state()).held, command, transition);
      }
      assert.equal(await rpc('BlitzAutorun'), true);
      await wait(async () => (await state()).held === '');
      checks.push(mode + ' starts and survives map/focus transitions; toggle releases');
    }
    for (const mode of ['run-open-forge', 'run-type', 'run-leave', 'run-manual-stop']) {
      assert.equal(await control('run-map'), true);
      assert.equal(await rpc('BlitzAutorun'), true);
      await wait(async () => (await state()).held === '2');
      assert.equal(await control(mode), true);
      await wait(async () => (await state()).held === '');
      await delay(150);
      assert.equal((await state()).held, '');
      checks.push(mode + ' releases map autorun');
    }
    for (const mode of ['login', 'typing', 'capture', 'run-unbound']) {
      assert.equal(await control(mode), true);
      assert.equal(await rpc('BlitzAutorun'), false, mode);
      assert.equal((await state()).held, '');
      checks.push(mode + ' rejects activation');
    }
    assert.equal(await control('run-map'), true);
    assert.equal(await rpc('BlitzAutorun'), true);
    await wait(async () => (await state()).held === '2');
    assert.equal(await rpc('BlitzStopAutorun'), true);
    await wait(async () => (await state()).held === '');
    checks.push('Explicit host stop releases map autorun');
    return {
      checks,
      scope:
        'Actual native helper, original key manager/release; synthetic held-command sink and stage deactivation. No accounts or OS input.',
    };
  }
);
