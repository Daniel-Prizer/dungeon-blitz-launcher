const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const root = process.cwd();
require('../research/gpu/background.cjs').lowerSelf();
(async () => {
  const out = fs.mkdtempSync(path.join(root, 'artifacts/native-media-')),
    as = path.join(out, 'as');
  fs.mkdirSync(as);
  fs.copyFileSync('test/native-media-fixture.as', path.join(as, 'DungeonBlitz.as'));
  const stage = JSON.parse(fs.readFileSync('.test-tools/release-stage.json')).stage,
    assets = [
      'UI_0.swf',
      'UI_1.swf',
      'UI_2.swf',
      'UI_3.swf',
      'UI_4.swf',
      'UI_Library.swf',
      'UI_Seasonal.swf',
    ];
  const stub = process.argv.find((v) => v.startsWith('--stub='))?.slice(7);
  if (!stub || !fs.existsSync(stub))
    throw Error('Pass --stub=<guarded offline constructor fixture>');
  cp.execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      path.resolve('.test-tools/focus/ffdec/ffdec.jar'),
      '-importScript',
      path.resolve(stub),
      path.join(out, 'fixture.swf'),
      as,
    ],
    { windowsHide: true, stdio: 'inherit', timeout: 120000 }
  );
  if (!process.argv.includes('--flash'))
    return require('../scripts/native-player-fixture.cjs').privateRun(
      {
        root,
        out,
        assets,
        hosted: true,
        production: true,
        frameRate: 120,
        capture: true,
        runtime: path.resolve(
          '.test-tools/native-fps-ruffle-source/target/dist/ruffle_desktop.exe'
        ),
      },
      async ({ rpc, delay, host }) => {
        const assert = require('node:assert/strict');
        host.send({ type: 'visibility', value: true });
        let result;
        for (let i = 0; i < 100; i++) {
          result = await rpc('BlitzMediaProbe');
          if (result?.ready || result?.error) break;
          await delay(100);
        }
        assert(result?.ready, result?.error || 'Not loaded');
        assert.equal(result.error, '');
        for (const check of result.checks) assert.equal(check.actual, check.expected, check.name);
        await rpc('BlitzFixtureCapture', [1]);
        await delay(200);
        return result;
      }
    );
  function flash(config) {
    const { app, BrowserWindow } = require('electron'),
      fs = require('fs'),
      path = require('path'),
      http = require('http');
    require('child_process').execFileSync(config.helper, ['--check'], { windowsHide: true });
    app.setPath('userData', path.join(config.out, 'empty-profile'));
    app.commandLine.appendSwitch(
      'ppapi-flash-path',
      path.join(process.resourcesPath, 'pepflashplayer64.dll')
    );
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.363');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.whenReady().then(async () => {
      const files = new Map([
        ['/fixture.swf', path.join(config.out, 'fixture.swf')],
        ...config.assets.map((n) => [
          '/assets/' + n,
          path.join(config.root, '.test-tools/wide-live-assets', n),
        ]),
      ]);
      const server = http.createServer((req, res) => {
        if (req.method !== 'GET' || (!files.has(req.url) && req.url !== '/')) {
          res.writeHead(404);
          return res.end();
        }
        res.setHeader(
          'Content-Type',
          req.url === '/' ? 'text/html' : 'application/x-shockwave-flash'
        );
        res.end(
          req.url === '/'
            ? '<embed id="game" src="/fixture.swf" type="application/x-shockwave-flash" width="1600" height="900" allowscriptaccess="always">'
            : fs.readFileSync(files.get(req.url))
        );
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const origin = 'http://127.0.0.1:' + server.address().port,
        win = new BrowserWindow({
          show: false,
          width: 1600,
          height: 900,
          webPreferences: {
            plugins: true,
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
          },
        });
      win.webContents.session.webRequest.onBeforeRequest((d, cb) =>
        cb({ cancel: !d.url.startsWith(origin + '/') })
      );
      const timer = setTimeout(() => app.exit(1), 35000);
      try {
        await win.loadURL(origin);
        win.showInactive();
        const value = await win.webContents.executeJavaScript(
          '(async()=>{for(let i=0;i<250;i++){const g=document.getElementById("game"),s=typeof g.BlitzMediaProbe==="function"?g.BlitzMediaProbe():null;if(s?.error)throw Error(s.error);if(s?.ready)return s;await new Promise(r=>setTimeout(r,100));}throw Error("Not ready");})()'
        );
        fs.writeFileSync(
          path.join(config.out, 'result.json'),
          JSON.stringify({ code: 0, result: value, noAccounts: true, noOSInput: true }, null, 2)
        );
        fs.writeFileSync(
          path.join(config.out, 'scene.png'),
          (await win.webContents.capturePage()).toPNG()
        );
      } catch (e) {
        fs.writeFileSync(path.join(config.out, 'failure.log'), e.stack);
        process.exitCode = 1;
      } finally {
        clearTimeout(timer);
        win.destroy();
        server.close();
        app.quit();
      }
    });
  }
  const src = path.join(out, 'source');
  fs.mkdirSync(src);
  fs.writeFileSync(
    path.join(src, 'package.json'),
    JSON.stringify({ name: 'media-reference', version: '1.0.0', main: 'main.cjs' })
  );
  fs.writeFileSync(
    path.join(src, 'main.cjs'),
    '(' +
      flash.toString() +
      ')(' +
      JSON.stringify({
        root,
        out,
        assets,
        helper: path.join(root, '.test-tools/PrivateDesktop.exe'),
      }) +
      ');'
  );
  const [dir] = await require('@electron/packager').packager({
    dir: src,
    name: 'AbilityIconReference',
    executableName: 'AbilityIconReference',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '11.5.0',
    out: path.join(out, 'package'),
    asar: true,
    extraResource: [path.join(stage, 'runtime/game/resources/pepflashplayer64.dll')],
  });
  const runner = path.join(out, 'run.cjs');
  fs.writeFileSync(
    runner,
    'require("child_process").execFileSync(' +
      JSON.stringify(path.join(dir, 'AbilityIconReference.exe')) +
      ',[],{windowsHide:true,stdio:"inherit",timeout:45000});'
  );
  cp.execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 50000,
  });
  console.log(out);
  if (!fs.existsSync(path.join(out, 'result.json'))) throw Error('Reference failed');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
