'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const [fixture, executable] = process.argv.slice(2).map((p) => path.resolve(p));
assert(fs.existsSync(fixture));
assert.equal(path.basename(executable), 'LocalWorldCompatibilityFixture.exe');
assert(fs.existsSync(executable));
const out = fs.mkdtempSync(path.join(root, 'artifacts/refresh-launcher-'));
async function run(config) {
  const fs = require('node:fs'),
    path = require('node:path'),
    http = require('node:http');
  const assert = require('node:assert/strict'),
    { _electron } = require('playwright');
  const profile = path.join(config.out, 'empty-profile'),
    entry = path.join(config.out, 'entry.cjs');
  require('node:child_process').execFileSync(
    path.join(config.root, '.test-tools/PrivateDesktop.exe'),
    ['--check'],
    { windowsHide: true }
  );
  let visits = 0,
    app;
  const files = new Map([
    ['/assets/UI_0.swf', path.join(config.root, '.test-tools/wide-live-assets/UI_0.swf')],
  ]);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/DungeonBlitz.swf')) {
      res.setHeader('Content-Type', 'application/x-shockwave-flash');
      return res.end(fs.readFileSync(config.fixture));
    }
    if (files.has(req.url)) {
      res.setHeader('Content-Type', 'application/x-shockwave-flash');
      return res.end(fs.readFileSync(files.get(req.url)));
    }
    if (req.url !== '/') {
      res.writeHead(404);
      return res.end();
    }
    const phase = visits++ ? 'resume' : 'playing';
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><html><style>html,body{margin:0;background:#484955;width:100%;height:100%;overflow:hidden}#game-container{width:100%;height:100%}object{display:block;width:100%;height:100%}</style><body><div id="game-container"><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/DungeonBlitz.swf?phase=${phase}"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div><script>setInterval(()=>{try{window.__fixtureResult=document.getElementById('DungeonBlitz').BlitzRefreshFixtureState()}catch{}},50)</script>`
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(profile);
  const settings = require(path.join(config.root, 'src/policy.cjs')).validSettings({
    gameURL: `http://localhost:${server.address().port}/`,
    gameRenderer: 'original',
    autoUpdates: false,
    renderResolution: 0.75,
    gameZoom: 1.25,
    showFPS: true,
    experimentalWidescreen: true,
    centeredHotbar: true,
    centeredCamera: true,
  });
  fs.writeFileSync(path.join(profile, 'preferences.json'), JSON.stringify({ settings }));
  fs.writeFileSync(
    entry,
    `const cp=require('child_process'),path=require('path'),{app}=require('electron');const spawn=cp.spawn;cp.spawn=(file,args,options)=>spawn(path.resolve(file)===${JSON.stringify(path.join(config.root, 'runtime/game/BlitzGame.exe'))}?${JSON.stringify(config.executable)}:file,args,options);const setPath=app.setPath.bind(app);app.setPath=(n,v)=>setPath(n,n==='userData'?${JSON.stringify(profile)}:v);require(${JSON.stringify(path.join(config.root, 'src/main.cjs'))});`
  );
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(fn) {
    for (let i = 0; i < 250; i++) {
      const value = await fn();
      if (value) return value;
      await delay(100);
    }
    throw Error('Refresh did not complete');
  }
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: [entry, '--smoke-test', '--private-desktop'], env });
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.blitz);
    const call = (name, value) =>
      page.evaluate(([n, v]) => window.blitz.action(n, v), [name, value]);
    const command = (value) =>
      app.evaluate(({}, v) => global.__blitzTest.nativeCommand(null, v), value);
    async function capture(name) {
      const file = path.join(config.out, name + '.png');
      await command({ type: 'capture', path: file });
      await until(() => fs.existsSync(file + '.json') && fs.existsSync(file));
      return JSON.parse(fs.readFileSync(file + '.json'));
    }
    async function ready() {
      await until(async () => !(await call('state')).loading);
      await delay(2000);
      return until(async () => {
        await command({ type: 'test-transition-fixture' });
        await delay(200);
        const r = await capture('probe-' + Date.now());
        return r.geometry.fixture?.ready && r.clientIntegration ? r : null;
      });
    }
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.showInactive();
      w.focus();
    });
    await ready();
    await call('fullscreen', true);
    await delay(500);
    const before = await capture('before'),
      oldPid = await app.evaluate(() => global.__blitzTest.runtime().child.pid);
    assert(before.geometry.fixture.refresh.visible);
    const r = before.geometry.fixture.refresh,
      x = Math.round((r.x + r.width / 2) * before.scale),
      y = Math.round((r.y + r.height / 2) * before.scale);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
      await command({ type: 'test-input', input: { type, x, y, button: 'left', clickCount: 1 } });
      await delay(50);
    }
    await until(
      async () =>
        visits === 2 &&
        (await app.evaluate(() => global.__blitzTest.runtime().child.pid)) !== oldPid
    );
    await ready();
    const after = await capture('after'),
      state = await call('state'),
      newPid = await app.evaluate(() => global.__blitzTest.runtime().child.pid);
    assert.equal(visits, 2);
    assert.notEqual(newPid, oldPid);
    assert.equal(
      after.geometry.fixture.entries,
      1,
      'Native Play callback selected exactly one remembered fixture character'
    );
    assert.equal(after.geometry.fixture.selected, 'FixtureHero');
    assert.equal(state.fullscreen, true);
    assert.deepEqual(state.settings, settings);
    assert.deepEqual(after.size, before.size);
    assert(Math.abs(after.scale - before.scale) < 0.000001);
    assert.equal(after.renderResolution, before.renderResolution);
    assert.equal(after.zoom, before.zoom);
    assert.equal(after.renderProbe.stageWidth, before.renderProbe.stageWidth);
    assert.equal(after.renderProbe.stageHeight, before.renderProbe.stageHeight);
    assert.equal(after.windows, 1, 'Refresh opens no additional game window');
    const result = {
      ok: true,
      oldPid,
      newPid,
      visits,
      selected: after.geometry.fixture.selected,
      entries: after.geometry.fixture.entries,
      fullscreen: state.fullscreen,
      viewport: after.size,
      renderResolution: after.renderResolution,
      zoom: after.zoom,
      browserScale: after.scale,
      settingsPreserved: true,
      scope:
        'Actual Flash button click, host pipe and shell process replacement; synthetic remembered character and Play callback. Empty fixture profiles on an inactive desktop, no accounts or global input.',
    };
    fs.writeFileSync(path.join(config.out, 'result.json'), JSON.stringify(result, null, 2));
  } finally {
    if (app) {
      await app.evaluate(() => global.__blitzTest.shutdown()).catch(() => {});
      await app.close().catch(() => {});
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
const runner = path.join(out, 'run.cjs');
fs.writeFileSync(
  runner,
  `(${run.toString()})(${JSON.stringify({ root, out, fixture, executable })}).catch(e=>{require('fs').writeFileSync(${JSON.stringify(path.join(out, 'failure.txt'))},e.stack);process.exitCode=1});`
);
try {
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 150000,
  });
} finally {
  if (fs.existsSync(path.join(out, 'failure.txt')))
    process.stdout.write(fs.readFileSync(path.join(out, 'failure.txt')));
}
assert(JSON.parse(fs.readFileSync(path.join(out, 'result.json'))).ok);
console.log(
  'PASS actual refresh click, game replacement, same character and retained fullscreen/detail: ' +
    out
);
