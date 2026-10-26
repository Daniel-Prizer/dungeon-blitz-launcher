'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const root = process.cwd(),
  [stub, runtime, assetDirectory] = process.argv.slice(2).map((p) => path.resolve(p));
if (!stub || !runtime || !assetDirectory || path.basename(runtime) !== 'ruffle_desktop.exe')
  throw Error('Pass an offline stub, independent native runtime and reviewed artwork folder');
require('../research/gpu/background.cjs').lowerSelf();
const assets = [
    'GlobalMap01.swf',
    'LevelsAC.swf',
    'LevelsCH.swf',
    'LevelsNR.swf',
    'LevelsOMM.swf',
    'LevelsSRN.swf',
  ],
  known = require('../src/gpu/assets.json').assets;
for (const name of assets) {
  const bytes = fs.readFileSync(path.join(assetDirectory, name));
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    known.find((a) => a.name === name).sha256
  );
}
const out = fs.mkdtempSync(path.join(root, 'artifacts/native-current-art-')),
  scripts = path.join(out, 'as');
fs.mkdirSync(scripts);
fs.copyFileSync('test/current-art-fixture.as', path.join(scripts, 'DungeonBlitz.as'));
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
    assetDirectory,
    assets,
    runtime,
    hosted: true,
    production: true,
    frameRate: 120,
    capture: true,
  },
  async ({ rpc, delay }) => {
    const assert = require('node:assert/strict');
    let state;
    for (let i = 0; i < 150; i++) {
      state = await rpc('BlitzArtworkState');
      if (state?.error) throw Error(state.error);
      if (state?.ready) break;
      await delay(100);
    }
    assert(state?.ready, 'Current artwork did not load');
    assert.equal(state.records.length, 6);
    await delay(250);
    assert.equal(await rpc('BlitzFixtureCapture', [1]), true);
    return state;
  }
);
