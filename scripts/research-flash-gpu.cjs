'use strict';
const fs = require('fs'),
  path = require('path'),
  { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  const out = fs.mkdtempSync(path.join(root, 'artifacts/flash-gpu-probe-')),
    source = path.join(out, 'source');
  fs.mkdirSync(source);
  const jar = path.join(root, '.test-tools/focus/ffdec/ffdec.jar');
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      jar,
      '-importScript',
      path.join(root, '.test-tools/focus/input-probe.swf'),
      path.join(out, 'fixture.swf'),
      path.join(root, 'research/flash-gpu'),
    ],
    { windowsHide: true, stdio: 'inherit', timeout: 100000 }
  );
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({ name: 'flash-gpu-performance-fixture', version: '1.0.0', main: 'main.cjs' })
  );
  function main(config) {
    const { app, BrowserWindow } = require('electron'),
      fs = require('fs'),
      path = require('path'),
      http = require('http');
    require('child_process').execFileSync(config.helper, ['--check'], { windowsHide: true });
    app.setPath('userData', path.join(config.out, 'empty-profile'));
    app.setName('Flash GPU Performance Fixture');
    app.commandLine.appendSwitch(
      'ppapi-flash-path',
      path.join(process.resourcesPath, 'pepflashplayer64.dll')
    );
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.363');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
    app.whenReady().then(async () => {
      const files = {
          '/': path.join(config.root, 'research/flash-gpu/probe.html'),
          '/worker.js': path.join(config.root, 'research/flash-gpu/worker.js'),
          '/fixture.swf': path.join(config.out, 'fixture.swf'),
        },
        server = http.createServer((req, res) => {
          const file = files[req.url];
          if (req.method !== 'GET' || !file) {
            res.writeHead(404);
            return res.end();
          }
          res.setHeader(
            'Content-Type',
            file.endsWith('.swf')
              ? 'application/x-shockwave-flash'
              : file.endsWith('.js')
                ? 'text/javascript'
                : 'text/html'
          );
          const body = fs.readFileSync(file);
          res.end(
            config.direct && file.endsWith('probe.html')
              ? body.toString('utf8').replace('value="transparent"', 'value="direct"')
              : body
          );
        });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const origin = 'http://127.0.0.1:' + server.address().port;
      const win = new BrowserWindow({
        width: 1000,
        height: 720,
        show: false,
        webPreferences: {
          plugins: true,
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          backgroundThrottling: false,
        },
      });
      win.webContents.session.webRequest.onBeforeRequest((d, cb) =>
        cb({ cancel: !d.url.startsWith(origin + '/') })
      );
      await win.loadURL(origin);
      win.showInactive();
      let result;
      try {
        result = await win.webContents.executeJavaScript('runProbe()');
        fs.writeFileSync(
          path.join(config.out, 'result.json'),
          JSON.stringify({ electron: process.versions, result }, null, 2)
        );
        fs.writeFileSync(
          path.join(config.out, 'proof.png'),
          (await win.webContents.capturePage()).toPNG()
        );
      } catch (e) {
        fs.writeFileSync(path.join(config.out, 'failure.txt'), e.stack);
        process.exitCode = 1;
      }
      win.destroy();
      server.close();
      app.quit();
    });
  }
  fs.writeFileSync(
    path.join(source, 'main.cjs'),
    '(' +
      main.toString() +
      ')(' +
      JSON.stringify({
        root,
        out,
        direct: process.argv.includes('--direct'),
        helper: path.join(root, '.test-tools/PrivateDesktop.exe'),
      }) +
      ');'
  );
  const [dir] = await require('@electron/packager').packager({
    dir: source,
    name: 'FlashGpuPerformanceFixture',
    executableName: 'FlashGpuPerformanceFixture',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '11.5.0',
    out: path.join(out, 'package'),
    asar: true,
    extraResource: [path.join(root, 'runtime/game/resources/pepflashplayer64.dll')],
  });
  const runner = path.join(out, 'run.cjs');
  fs.writeFileSync(
    runner,
    'require("child_process").execFileSync(' +
      JSON.stringify(path.join(dir, 'FlashGpuPerformanceFixture.exe')) +
      ',[],{windowsHide:true,stdio:"inherit",timeout:40000});'
  );
  try {
    execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
      stdio: 'inherit',
      windowsHide: true,
      timeout: 45000,
    });
  } finally {
    for (const name of ['result.json', 'failure.txt'])
      if (fs.existsSync(path.join(out, name)))
        console.log(fs.readFileSync(path.join(out, name), 'utf8'));
    console.log(out);
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
