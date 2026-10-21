'use strict';
const { _electron: electron } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { validSettings } = require('../src/policy.cjs'),
  review = require('../src/legacy/client-singleplayer.json');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'docs/singleplayer-tests');
fs.mkdirSync(out, { recursive: true });
const offline = process.env.BLITZ_SINGLEPLAYER_OFFLINE === '1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    const value = await fn();
    if (value) return value;
    await wait(100);
  }
  throw Error('Singleplayer check timed out');
}
(async () => {
  fs.mkdirSync(path.join(root, '.test-profile'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.test-profile/preferences.json'),
    JSON.stringify({
      settings: validSettings({
        gameURL: 'http://localhost:8000/',
        experimentalWidescreen: true,
        centeredCamera: true,
        shiftMount: true,
        showFPS: true,
        autoUpdates: false,
      }),
    })
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const records = [];
  try {
    app = await electron.launch({ args: [root, '--smoke-test', '--private-desktop'], env });
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.blitz);
    const call = (name, value) =>
      page.evaluate(([name, value]) => window.blitz.action(name, value), [name, value]);
    const cmd = (value) =>
      app.evaluate(({}, value) => global.__blitzTest.nativeCommand(null, value), value);
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(1920, 1112);
      w.showInactive();
      w.focus();
    });
    if (!offline) {
      await until(async () => (await call('state')).clientIntegration === true);
      await wait(15000);
    }
    async function sample(name) {
      const file = path.join(out, name + '.png');
      if (fs.existsSync(file + '.json')) fs.unlinkSync(file + '.json');
      await cmd({ type: 'capture', path: file });
      let record;
      await until(() => {
        try {
          record = JSON.parse(fs.readFileSync(file + '.json'));
          return fs.existsSync(file);
        } catch {
          return false;
        }
      });
      records.push({ name, ...record });
      return record;
    }
    for (const address of offline ? [] : ['http://localhost:8000/', 'http://127.0.0.1:8000/']) {
      if ((await call('state')).gameURL !== address) {
        await call('save-settings', { gameURL: address });
        await call('restart-game');
        await until(async () => (await call('state')).clientIntegration === true);
        await wait(4500);
      }
      const r = await sample(
        address.includes('127.0') ? 'loopback-alias-title' : 'localhost-title'
      );
      assert.equal(r.testClientHash, review.inputHash);
      assert.equal(r.testAdapterMode, 'contract');
      assert(r.clientIntegration && r.audioIntegration);
      assert(r.renderProbe);
      assert(r.renderProbe.centeredCamera);
      assert(r.renderProbe.widescreen.requested);
      assert.equal(
        r.renderProbe.widescreen.active,
        false,
        'Title artwork remains in its native layout'
      );
      assert(r.renderProbe.bitmapWidth > 1000);
      assert(r.geometry.rect.width > 1000);
      assert.equal((await call('state')).error, '');
    }
    await call('settings');
    await page.getByRole('tab', { name: 'Connection', exact: true }).click();
    const before = (await call('state')).gameURL;
    await page.getByRole('button', { name: 'Use singleplayer', exact: true }).click();
    assert.equal(await page.locator('#game-url').inputValue(), 'http://localhost:8000/');
    assert.equal((await call('state')).gameURL, before);
    await page.getByRole('button', { name: 'Use multiplayer', exact: true }).click();
    assert.equal(
      await page.locator('#game-url').inputValue(),
      'https://dungeonblitzr.theminesa.studio/'
    );
    assert.equal((await call('state')).gameURL, before);
    await call('dismiss');
    // Original game controllers and current local artwork, with network/login
    // initialization replaced only inside the unshipped fixture.
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/assets/')) {
        const file = path.basename(req.url);
        res.setHeader('Content-Type', 'application/x-shockwave-flash');
        res.end(fs.readFileSync(path.join(process.env.BLITZ_TEST_ASSET_DIR, file)));
        return;
      }
      if (req.url === '/DungeonBlitz.swf') {
        res.setHeader('Content-Type', 'application/x-shockwave-flash');
        res.end(fs.readFileSync(path.join(root, '.test-tools/transition-singleplayer/fixed.swf')));
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}object{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" data="/DungeonBlitz.swf" type="application/x-shockwave-flash"><param name="movie" value="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>'
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      await call('save-settings', {
        gameURL: 'http://127.0.0.1:' + server.address().port + '/',
        centeredCamera: false,
        shiftMount: true,
        showFPS: false,
      });
      await call('restart-game');
      await until(async () => !(await call('state')).loading);
      await wait(1800);
      await cmd({ type: 'test-transition-fixture' });
      await until(async () => (await call('state')).clientIntegration === true);
      await wait(700);
      await cmd({ type: 'test-transition-control', play: true, transition: false });
      await wait(500);
      const base = (await sample('wide-hotbar')).renderProbe;
      assert(base?.widescreen, JSON.stringify(base?.fixture));
      assert(base.widescreen.active);
      assert.equal(base.fixture.worldError, '');
      for (const menu of [
        'barn',
        'tome',
        'forge',
        'social',
        'settings',
        'map',
        'idols',
        'trove',
        'companion-commands',
      ]) {
        await cmd({ type: 'test-transition-control', play: true, transition: false, menu });
        await wait(250);
        const r = (await sample(menu)).renderProbe;
        assert(r.widescreen.active);
        assert.equal(r.fixture.worldError, '');
        assert(!r.widescreen.decorationAnimating);
      }
      for (const phase of ['Login', 'None', 'Transfer']) {
        await cmd({
          type: 'test-transition-control',
          play: false,
          transition: true,
          phase,
          transfer: true,
          menu: 'none',
        });
        await wait(300);
        const r = (await sample('travel-' + phase)).renderProbe;
        assert.equal(r.widescreen.logicalWidth, base.widescreen.logicalWidth);
        assert.equal(r.bitmapWidth, base.bitmapWidth);
        assert.equal(r.bitmapHeight, base.bitmapHeight);
      }
      await cmd({ type: 'test-transition-control', play: true, transition: false, menu: 'none' });
      await wait(250);
      for (const pan of [0, 125.6, 1151.7, 6000, 17000, 23000]) {
        await cmd({
          type: 'test-world-control',
          pan,
          vertical: 1500,
          scene: false,
          oldCoverage: false,
          reuse: true,
          tiedTime: true,
        });
        await wait(150);
        const r = (await sample('world-' + pan)).renderProbe;
        assert.equal(r.fixture.worldError, '');
        assert.equal(r.fixture.pixelErrors, 0);
        assert.equal(r.fixture.cacheRebuilds, 0);
      }
      for (const art of ['a_Room_GreatHall', 'a_Room_Library', 'a_Room_Armory', 'a_Room_Stables']) {
        await cmd({
          type: 'test-world-control',
          pan: 250,
          vertical: 250,
          scene: true,
          oldCoverage: false,
          art,
        });
        await wait(500);
        const r = (await sample(art)).renderProbe;
        assert(r.widescreen.active);
        assert.equal(r.widescreen.interiorLimited, false);
        assert.equal(r.fixture.worldError, '');
      }
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  } finally {
    if (app) await app.close();
  }
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        records,
        offline,
        titleVerified: !offline,
        limits:
          (offline ? 'Local-server title omitted: server is off. ' : '') +
          'Unauthenticated local title plus offline original-controller fixtures on an inactive desktop; no saved authentication or gameplay, no OS input/cursor confinement.',
      },
      null,
      2
    )
  );
  console.log(
    'PASS Singleplayer ' +
      (offline ? 'offline controllers (local-server title omitted)' : 'local/loopback title') +
      ', integration, URL presets without reconnect, original local menus/HUD/loading/interiors/cache'
  );
  await require('./camera-map-test.cjs');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
