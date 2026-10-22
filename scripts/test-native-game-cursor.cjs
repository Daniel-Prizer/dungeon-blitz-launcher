const fs = require('fs'),
  path = require('path'),
  cp = require('child_process'),
  assert = require('assert/strict');
const root = path.resolve(__dirname, '..'),
  [stub, runtime] = process.argv.slice(2).map((p) => path.resolve(p));
if (
  !stub ||
  !runtime ||
  !fs.existsSync(stub) ||
  !fs.existsSync(runtime) ||
  path.basename(runtime) !== 'ruffle_desktop.exe'
)
  throw Error('Pass the guarded offline SWF stub and unbranded owned native runtime');
const out = fs.mkdtempSync(path.join(root, 'artifacts/native-game-cursor-')),
  as = path.join(out, 'as');
fs.mkdirSync(as);
fs.copyFileSync('test/native-game-cursor-fixture.as', path.join(as, 'DungeonBlitz.as'));
require('../research/gpu/background.cjs').lowerSelf();
cp.execFileSync(
  'java',
  [
    '-Xmx768m',
    '-Djava.awt.headless=true',
    '-jar',
    path.resolve('.test-tools/focus/ffdec/ffdec.jar'),
    '-importScript',
    stub,
    path.join(out, 'fixture.swf'),
    as,
  ],
  { windowsHide: true, stdio: 'inherit', timeout: 120000 }
);
require('../scripts/native-player-fixture.cjs').privateRun(
  {
    root,
    out,
    assets: [
      'UI_0.swf',
      'UI_1.swf',
      'UI_2.swf',
      'UI_3.swf',
      'UI_4.swf',
      'UI_Library.swf',
      'UI_Seasonal.swf',
    ],
    hosted: true,
    production: true,
    frameRate: 120,
    runtime,
    runtimeBudgetMs: 45000,
  },
  async ({ rpc, delay, host }) => {
    const assert = require('assert/strict');
    const wait = async (fn) => {
      for (let i = 0; i < 100; i++) {
        const v = await fn();
        if (v) return v;
        await delay(50);
      }
      throw Error('Cursor not ready');
    };
    host.send({
      type: 'crosshair',
      value: { style: 'default', color: '#8cff65', size: 24, outline: true },
    });
    const results = [];
    for (const name of [
      'a_CustomMouse_UI',
      'a_CustomMouse_SwordMelee',
      'a_CustomMouse_SwordRanged',
      'a_CustomMouse_Door',
      'a_CustomMouse_Chat',
      'a_CustomMouse_ChatMore',
      'a_CustomMouse_ChatEnd',
      'a_CustomMouse_Hotspot',
      'a_CustomMouse_Inspect',
      'a_CustomMouse_ZoneDoor',
      'a_CustomMouse_Forge',
      'a_CustomMouse_Housing',
      'a_CustomMouse_Key',
      'a_CustomMouse_KeyWaiting',
      'a_CustomMouse_Dye',
      'a_CustomMouse_Sigil',
    ]) {
      const expected = await wait(() => rpc('BlitzAuditGameCursor', [name]));
      const actual = await wait(async () => {
        const g = JSON.parse(await rpc('BlitzFixtureGameCursor'));
        return g.selected === name && g.ready ? g : null;
      });
      assert(actual.dryRun);
      assert.equal(actual.width, 32);
      assert.equal(actual.height, 32);
      assert.deepEqual(actual.hotspot, expected.hotspot);
      assert.deepEqual(actual.rgba, expected.rgba);
      assert(actual.rgba.some((v, i) => i % 4 === 3 && v > 0));
      await wait(async () => JSON.parse(await rpc('BlitzFixtureCursor')).applied === true);
      results.push({
        name,
        hotspot: actual.hotspot,
        nontransparent: actual.rgba.filter((v, i) => i % 4 === 3 && v > 0).length,
      });
    }
    await rpc('BlitzAuditCursorText', ['ibeam']);
    await wait(async () => JSON.parse(await rpc('BlitzFixtureCursor')).applied === false);
    const noCustom = JSON.parse(await rpc('BlitzFixtureGameCursor'));
    assert.equal(noCustom.selected, null);
    assert(await rpc('BlitzAuditCursorLifecycle', ['register']));
    const copied = await wait(async () => {
      const value = JSON.parse(await rpc('BlitzFixtureGameCursor'));
      return value.selected === 'FixtureCursor' && value.ready ? value : null;
    });
    assert.deepEqual(copied.hotspot, [3, 5]);
    assert.deepEqual(copied.rgba, Array.from({ length: 1024 }, () => [18, 204, 102, 255]).flat());
    const frames = new Set();
    for (let i = 0; i < 20; i++) {
      frames.add(JSON.parse(await rpc('BlitzFixtureGameCursor')).frame);
      await delay(35);
    }
    assert.equal(frames.size, 2);
    assert(await rpc('BlitzAuditCursorLifecycle', ['invalid']));
    assert.equal(JSON.parse(await rpc('BlitzFixtureGameCursor')).selected, 'FixtureCursor');
    assert(await rpc('BlitzAuditCursorLifecycle', ['unregister']));
    assert.equal(JSON.parse(await rpc('BlitzFixtureGameCursor')).selected, null);
    return {
      results,
      originalGameArtwork: true,
      liveDefault: true,
      textCursor: true,
      scope:
        'Original CustomMouse.method_66 and registered artwork/hotspots through actual native backend. OS application remains dry-run.',
    };
  }
);
