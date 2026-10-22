'use strict';
const fs = require('fs'),
  path = require('path'),
  cp = require('child_process'),
  crypto = require('crypto');
const root = process.cwd(),
  [stub, runtime] = process.argv.slice(2).map((p) => path.resolve(p));
if (!fs.existsSync(stub) || path.basename(runtime) !== 'ruffle_desktop.exe')
  throw Error('Pass a guarded offline constructor stub and owned unbranded runtime');
require('../research/gpu/background.cjs').lowerSelf();
const out = fs.mkdtempSync(path.join(root, 'artifacts/refresh-controls-')),
  lib = path.join(root, '.test-tools/focus/ffdec/lib/*');
cp.execFileSync(
  'javac',
  ['-cp', lib, '-d', out, path.join(root, 'scripts/RefreshFixtureBuilder.java')],
  { windowsHide: true, stdio: 'inherit' }
);
cp.execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-cp',
    out + ';' + lib,
    'RefreshFixtureBuilder',
    stub,
    path.join(out, 'stub.swf'),
    crypto.createHash('sha256').update(fs.readFileSync(stub)).digest('hex'),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
cp.execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-jar',
    path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
    '-importScript',
    path.join(out, 'stub.swf'),
    path.join(out, 'fixture.swf'),
    path.join(root, 'test/refresh-fixture'),
  ],
  { windowsHide: true, stdio: 'inherit', timeout: 120000 }
);
require('./native-player-fixture.cjs').privateRun(
  {
    root,
    out,
    runtime,
    assets: ['UI_0.swf'],
    hosted: true,
    production: true,
    frameRate: 240,
    capture: true,
  },
  async ({ rpc, delay, host }) => {
    const assert = require('assert/strict'),
      checks = [];
    for (let i = 0; i < 100; i++) {
      if ((await rpc('BlitzRefreshFixtureState'))?.ready) break;
      await delay(50);
    }
    host.send({ type: 'visibility', value: true });
    await delay(150);
    await rpc('BlitzFixtureFocus', [true]);
    let state = await rpc('BlitzRefreshFixtureState');
    assert(state.ready && state.refresh.visible);
    assert(state.refresh.x >= 0 && state.refresh.x + state.refresh.width <= 1600);
    await rpc('BlitzFixtureCapture', [1]);
    for (const mode of ['cached', 'list', 'missing', 'account', 'duplicate']) {
      await rpc('BlitzRefreshFixtureControl', [mode]);
      host.send({ type: 'resume-character', value: { userID: 123, name: 'FixtureHero' } });
      await delay(250);
      state = await rpc('BlitzRefreshFixtureState');
      assert.equal(state.entries, ['cached', 'list'].includes(mode) ? 1 : 0, mode);
      if (mode === 'list') {
        assert.equal(state.index, '1');
        assert.equal(state.selected, 'FixtureHero');
      }
      assert.equal(state.refresh.pending, false, mode);
      checks.push({ mode, entries: state.entries });
    }
    await rpc('BlitzRefreshFixtureControl', ['waiting']);
    host.send({ type: 'resume-character', value: { userID: 123, name: 'FixtureHero' } });
    await delay(150);
    assert((await rpc('BlitzRefreshFixtureState')).refresh.pending);
    await rpc('BlitzFixtureKey', [true, 'a']);
    await rpc('BlitzFixtureKey', [false, 'a']);
    await rpc('BlitzRefreshFixtureControl', ['cached']);
    await delay(150);
    assert.equal((await rpc('BlitzRefreshFixtureState')).entries, 0);
    checks.push('Manual input cancels a pending resume');
    for (const mode of ['dead', 'cooldown', 'typing', 'alive', 'hidden', 'modal']) {
      await rpc('BlitzFixtureKey', [false, 'enter']);
      await rpc('BlitzRefreshFixtureControl', [mode]);
      await rpc('BlitzFixtureKey', [true, 'enter']);
      await rpc('BlitzFixtureKey', [true, 'enter']);
      await rpc('BlitzFixtureKey', [false, 'enter']);
      state = await rpc('BlitzRefreshFixtureState');
      assert.equal(state.presses, mode === 'dead' ? 1 : 0, mode);
      if (['typing', 'alive', 'hidden', 'modal'].includes(mode))
        assert(state.keys > 0, mode + ' keeps native Enter routing');
      checks.push({ mode, presses: state.presses, keys: state.keys });
    }
    return {
      checks,
      scope:
        'Synthetic character selection and native stage key events on an inactive desktop. Selection authentication and packet callbacks are stubbed only in the fixture. No account, OS input or human game accessed.',
    };
  }
);
