'use strict';
const { _electron: electron } = require('playwright'),
  fs = require('fs'),
  path = require('path'),
  http = require('http'),
  assert = require('assert/strict'),
  { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'),
  wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    const value = await fn();
    if (value) return value;
    await wait(100);
  }
  throw Error('Autorun fixture timed out');
}
(async () => {
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), ['--check'], {
    windowsHide: true,
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/assets/UI_0.swf' || req.url === '/fixture.swf') {
      res.setHeader('Content-Type', 'application/x-shockwave-flash');
      res.end(
        fs.readFileSync(
          req.url === '/fixture.swf'
            ? path.join(root, '.test-tools/input-shortcuts/fixture.swf')
            : path.join(root, '.test-tools/wide-live-assets/UI_0.swf')
        )
      );
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><body style="margin:0"><div id="game-container"><object id="DungeonBlitz" data="/fixture.swf" type="application/x-shockwave-flash" width="1152" height="768"><param name="allowScriptAccess" value="sameDomain"></object></div></body>'
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let app;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [root, '--smoke-test', '--private-desktop'], env });
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.blitz);
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.showInactive();
      w.focus();
    });
    const call = (name, value) =>
        page.evaluate(([n, v]) => window.blitz.action(n, v), [name, value]),
      cmd = (value) => app.evaluate(({}, v) => global.__blitzTest.nativeCommand(null, v), value);
    await call('save-settings', {
      gameURL: 'http://localhost:' + server.address().port + '/',
      autorun: true,
    });
    await call('restart-game');
    await until(async () => !(await call('state')).loading);
    await wait(1000);
    await cmd({ type: 'test-shortcut-fixture' });
    const probe = async () => {
      const file = path.join(root, 'docs/autorun-probe');
      if (fs.existsSync(file + '.json')) fs.unlinkSync(file + '.json');
      await cmd({ type: 'test-geometry', path: file });
      return until(() => {
        try {
          return JSON.parse(fs.readFileSync(file + '.json'));
        } catch {
          return null;
        }
      });
    };
    await until(async () => (await probe()).geometry.inputProbe?.phase === 'ready');
    await call('dismiss');
    await cmd({ type: 'focus' });
    await wait(350);
    for (const type of ['mouseDown', 'mouseUp'])
      await cmd({
        type: 'test-input',
        input: { type, x: 600, y: 300, button: 'left', clickCount: 1 },
      });
    await wait(200);
    const control = async (value) => {
        await cmd({ type: 'test-shortcut-control', value });
        await wait(100);
        const p = (await probe()).geometry.inputProbe;
        if (p.error) throw Error(p.error);
      },
      run = async () => {
        for (const value of ['keyDown', 'keyUp']) await cmd({ type: 'test-autorun-key', value });
        await wait(200);
      };
    for (const [mode, key] of [
      ['run-play', 39],
      ['left', 37],
      ['run-rebind', 68],
    ]) {
      await control(mode);
      await run();
      const a = await probe();
      assert(a.focused && a.visible);
      const downs = a.geometry.inputProbe.events.filter(
        (e) => e.type === 'keyDown' && e.command === (mode === 'left' ? 1 : 2)
      );
      assert.equal(downs.length, 1, mode + JSON.stringify(a.geometry.inputProbe));
      const held = downs[0].code;
      assert.equal(
        a.geometry.inputProbe.events.filter((e) => e.type === 'keyUp' && e.code === held).length,
        0
      );
      await run();
      assert.equal(
        (await probe()).geometry.inputProbe.events.filter(
          (e) => e.type === 'keyUp' && e.code === held
        ).length,
        1
      );
    }
    await control('run-play');
    await cmd({ type: 'test-input', input: { type: 'keyDown', keyCode: 'Right' } });
    await run();
    assert.equal((await probe()).geometry.inputProbe.held, '2');
    await cmd({ type: 'test-input', input: { type: 'keyUp', keyCode: 'Right' } });
    await wait(150);
    assert.equal(
      (await probe()).geometry.inputProbe.held,
      '2',
      'Native movement-key release must not interrupt autorun'
    );
    await control('run-face-left');
    assert.equal(
      (await probe()).geometry.inputProbe.held,
      '2',
      'Aiming/facing changes must retain the activated direction'
    );
    const heldDowns = (await probe()).geometry.inputProbe.events.filter(
      (e) => e.type === 'keyDown'
    ).length;
    await wait(500);
    assert.equal(
      (await probe()).geometry.inputProbe.events.filter((e) => e.type === 'keyDown').length,
      heldDowns,
      'No repeated pulses while the command remains held'
    );
    await run();
    assert.equal((await probe()).geometry.inputProbe.held, '', 'Toggle still releases movement');
    for (const mode of ['run-play', 'run-map']) {
      await control(mode);
      await run();
      await control('run-open-map');
      await wait(150);
      assert.equal((await probe()).geometry.inputProbe.held, '2', 'Map preserves autorun');
      await control('run-close-map');
      await wait(150);
      assert.equal((await probe()).geometry.inputProbe.held, '2', 'Closing map preserves autorun');
      await run();
      assert.equal((await probe()).geometry.inputProbe.held, '', 'Toggle releases map autorun');
    }
    for (const mode of ['login', 'typing', 'capture']) {
      await control(mode);
      await run();
      assert.equal(
        (await probe()).geometry.inputProbe.events.filter((e) => [37, 39, 68].includes(e.code))
          .length,
        0,
        mode
      );
    }
    await control('run-play');
    await run();
    for (const type of ['keyDown', 'keyUp'])
      await cmd({ type: 'test-input', input: { type, keyCode: 'Left' } });
    await wait(150);
    assert(
      (await probe()).geometry.inputProbe.events.some((e) => e.type === 'keyUp' && e.code === 39)
    );
    await control('run-play');
    await run();
    await call('settings');
    await wait(200);
    assert(
      (await probe()).geometry.inputProbe.events.some((e) => e.type === 'keyUp' && e.code === 39)
    );
    await call('dismiss');
    await wait(300);
    await control('run-play');
    await call('save-settings', { autorun: false });
    await run();
    assert.equal((await probe()).geometry.inputProbe.events.filter((e) => e.code === 39).length, 0);
    await call('save-settings', { autorun: true });
    await call('settings');
    await page.getByRole('tab', { name: 'Controls', exact: true }).click();
    await page.locator('#autorun-key').click();
    await page.keyboard.press('r');
    assert.equal(await page.locator('#autorun-key').textContent(), 'R');
    assert.equal((await call('state')).settings.autorunKey, 'ö', 'Capture remains a draft');
    await page.locator('#save-settings').click();
    await until(async () => (await call('state')).settings.autorunKey === 'KeyR');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, '.test-profile/preferences.json'))).settings
        .autorunKey,
      'KeyR'
    );
    await page.locator('#autorun-key').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#autorun-key').textContent(), 'R');
    await page.locator('#autorun-default').click();
    assert.equal(await page.locator('#autorun-key').textContent(), 'Ö');
    await page.locator('#discard').click();
    assert.equal(await page.locator('#autorun-key').textContent(), 'R');
    await page.screenshot({ path: path.join(root, 'docs/autorun-rebind-controls.png') });
    await call('dismiss');
    await cmd({ type: 'focus' });
    await wait(300);
    await control('run-play');
    await run();
    assert.equal(
      (await probe()).geometry.inputProbe.events.filter((e) => e.code === 39).length,
      0,
      'Previous Ö binding is inactive'
    );
    const rebindRun = async () => {
      for (const type of ['keyDown', 'keyUp'])
        await cmd({ type: 'test-input', input: { type, keyCode: 'R' } });
      await wait(200);
    };
    await rebindRun();
    assert.equal((await probe()).geometry.inputProbe.held, '2', 'Saved R binding starts autorun');
    await rebindRun();
    assert.equal((await probe()).geometry.inputProbe.held, '', 'Saved R binding toggles off');
    await control('typing');
    await rebindRun();
    assert.equal(
      (await probe()).geometry.inputProbe.events.filter((e) => e.code === 39).length,
      0,
      'R remains normal text while typing'
    );
    fs.writeFileSync(
      path.join(root, 'docs/autorun-results.json'),
      JSON.stringify(
        {
          passed: true,
          version: require('../package.json').version,
          checks: [
            'Native facing right/left and rebound movement key',
            'Exactly one down held until toggle pairs release',
            'Physical movement key-up through native release retains autorun; no repeated pulses',
            'Facing changes retain the activated direction',
            'Manual movement and Settings release',
            'Map open/close retains movement; login/text/capture/disabled guards',
            'Rendered key capture, save/persistence, Escape, Default/discard, R native input and old Ö rejection',
          ],
          limits:
            'Native key manager and release handler; synthetic key-down held-command sink, no authenticated gameplay',
          noAccounts: true,
          noOSInput: true,
        },
        null,
        2
      )
    );
    console.log('PASS native autorun facing, binding, paired input, cancellation and guards');
  } finally {
    if (app) {
      await app.evaluate(() => global.__blitzTest.shutdown()).catch(() => {});
      await app.close().catch(() => {});
    }
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
