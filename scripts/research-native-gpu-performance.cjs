'use strict';
const fs = require('fs'),
  path = require('path'),
  { execFileSync } = require('child_process'),
  root = path.resolve(__dirname, '..');
(async () => {
  require('../research/gpu/background.cjs').lowerSelf();
  const out = fs.mkdtempSync(path.join(root, 'artifacts/native-gpu-performance-')),
    source = path.join(out, 'source'),
    as = path.join(out, 'as');
  fs.mkdirSync(source);
  fs.mkdirSync(as);
  const lib = path.join(root, '.test-tools/focus/ffdec/lib/*'),
    jar = path.join(root, '.test-tools/focus/ffdec/ffdec.jar');
  const adapted = require('../src/gpu/client-adapter.cjs').adaptGpuClient(
    fs.readFileSync(path.join(root, '.test-tools/gpu-current-oct21/current.swf')),
    require('../src/gpu/adapter.json')
  );
  if (!adapted) throw Error('Reviewed GPU client rejected');
  fs.writeFileSync(path.join(out, 'adapted.swf'), adapted);
  execFileSync(
    'javac',
    ['-cp', lib, '-d', out, path.join(root, 'research/flash-gpu/NativePerfFixtureBuilder.java')],
    { stdio: 'inherit', windowsHide: true }
  );
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-cp',
      out + path.delimiter + lib,
      'NativePerfFixtureBuilder',
      path.join(out, 'adapted.swf'),
      path.join(out, 'stub.swf'),
    ],
    { stdio: 'inherit', windowsHide: true }
  );
  let owned = fs.readFileSync(path.join(root, 'test/transition-fixture/DungeonBlitz.as'), 'utf8');
  owned = owned
    .replace(
      'main=new Main();addChild(main);',
      'main=new Main();addChild(main);BlitzGpuBridge.Attach(main);'
    )
    .replace(
      'graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();',
      ''
    );
  if (process.argv.includes('--60'))
    owned = owned.replace('stage.frameRate=30;', 'stage.frameRate=60;');
  owned = owned.replace(
    'addEventListener(Event.ENTER_FRAME,draw,false,-102);',
    'addEventListener(Event.ENTER_FRAME,draw,false,-102);ExternalInterface.addCallback("PerfState",perfState);ExternalInterface.addCallback("PerfEcho",perfEcho);'
  );
  owned = owned.replace(
    'private function drawWorld():void {',
    'private var perfFrames:uint=0;private var perfEchoes:uint=0;private function perfState():Object{return {frames:perfFrames,time:getTimer(),echoes:perfEchoes,worldError:worldError};}private function perfEcho(text:String):Object{perfEchoes++;game.screenQuestTracker.var_2.am_QuestDesc.text=text;return perfState();}\n  private function drawWorld():void {'
  );
  owned = owned.replace(
    'ExternalInterface.addCallback("PerfEcho",perfEcho);',
    'ExternalInterface.addCallback("PerfEcho",perfEcho);ExternalInterface.addCallback("PerfFreeze",function(value:Boolean):void{perfFrozen=value;});'
  );
  owned = owned.replace(
    'private var perfFrames:uint=0;',
    'private var perfFrozen:Boolean=false;private var perfFrames:uint=0;'
  );
  owned = owned.replace(
    'game.mTimeThisTick=tiedTime?',
    'perfFrames++;if(!perfFrozen)pan=250+100*Math.sin(getTimer()/2000);game.mTimeThisTick=tiedTime?'
  );
  fs.writeFileSync(path.join(as, 'DungeonBlitz.as'), owned);
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      jar,
      '-importScript',
      path.join(out, 'stub.swf'),
      path.join(out, 'fixture.swf'),
      as,
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 120000 }
  );
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({ name: 'native-gpu-performance-fixture', version: '1.0.0', main: 'main.cjs' })
  );
  function main(config) {
    const { app, BrowserWindow } = require('electron'),
      fs = require('fs'),
      path = require('path'),
      http = require('http');
    require('child_process').execFileSync(config.helper, ['--check'], { windowsHide: true });
    app.setPath('userData', path.join(config.out, 'empty-profile'));
    app.setName('Native GPU Performance Fixture');
    app.commandLine.appendSwitch(
      'ppapi-flash-path',
      path.join(process.resourcesPath, 'pepflashplayer64.dll')
    );
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.363');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
    app.whenReady().then(async () => {
      const files = {
        '/': path.join(config.root, 'research/flash-gpu/native-world.html'),
        '/pixels.mjs': path.join(config.root, 'research/flash-gpu/pixels.mjs'),
        '/fixture.swf': path.join(config.out, 'fixture.swf'),
      };
      for (const name of fs
        .readdirSync(path.join(config.root, 'src/gpu'))
        .filter((n) => n.endsWith('.mjs')))
        files['/gpu/' + name] = path.join(config.root, 'src/gpu', name);
      for (const name of fs
        .readdirSync(path.join(config.root, '.test-tools/wide-live-assets'))
        .filter((n) => n.endsWith('.swf')))
        files['/assets/' + name] = path.join(config.root, '.test-tools/wide-live-assets', name);
      const trace = (value) =>
        fs.appendFileSync(path.join(config.out, 'progress.txt'), Date.now() + ' ' + value + '\n');
      const server = http.createServer((req, res) => {
        trace(req.method + ' ' + req.url);
        const file = files[req.url];
        if (req.method !== 'GET' || !file) {
          res.writeHead(404);
          return res.end();
        }
        res.setHeader(
          'Content-Type',
          file.endsWith('.swf')
            ? 'application/x-shockwave-flash'
            : file.endsWith('.mjs')
              ? 'text/javascript'
              : 'text/html'
        );
        res.end(fs.readFileSync(file));
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const origin = 'http://127.0.0.1:' + server.address().port;
      const win = new BrowserWindow({
        width: 1600,
        height: 900,
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
      win.webContents.on('render-process-gone', (_e, details) => {
        fs.writeFileSync(
          path.join(config.out, 'failure.txt'),
          'Owned renderer stopped: ' + JSON.stringify(details)
        );
        trace('renderer stopped ' + JSON.stringify(details));
        win.destroy();
        server.close();
        app.quit();
      });
      win.webContents.session.webRequest.onBeforeRequest((d, cb) =>
        cb({ cancel: !d.url.startsWith(origin + '/') && !d.url.startsWith('blob:' + origin + '/') })
      );
      const errors = [];
      win.webContents.on('console-message', (_e, l, m) => {
        trace('console ' + m);
        if (/^OWNED_PROOF_(gpu|original|resized)$/.test(m))
          void win.webContents.capturePage().then((image) => {
            fs.writeFileSync(path.join(config.out, m + '.png'), image.toPNG());
            return win.webContents.executeJavaScript(
              'window.__ownedProofSaved=' + JSON.stringify(m)
            );
          });
        if (l > 1 && errors.length < 10) errors.push(m);
      });
      trace('navigate');
      await win.loadURL(origin);
      trace('loaded');
      win.showInactive();
      try {
        const bundler = require(path.join(config.root, 'src/legacy/gpu-bundle.cjs')),
          bundles = bundler.resources(path.join(config.root, 'src/gpu'));
        await win.webContents.executeJavaScript(
          'window.__ownedGpuClass=' +
            bundler.bundle(path.join(config.root, 'src/gpu'), 'session.mjs') +
            '.GpuSession;window.__ownedGpuResources=' +
            JSON.stringify({ worker: bundles.worker, art: bundles.art }) +
            ';'
        );
        const result = await win.webContents.executeJavaScript('runProbe()');
        fs.writeFileSync(
          path.join(config.out, 'result.json'),
          JSON.stringify({ result, errors }, null, 2)
        );
        fs.writeFileSync(
          path.join(config.out, 'proof.png'),
          (await win.webContents.capturePage()).toPNG()
        );
      } catch (error) {
        fs.writeFileSync(
          path.join(config.out, 'failure.txt'),
          error.stack + '\n' + JSON.stringify(errors)
        );
        fs.writeFileSync(
          path.join(config.out, 'failure.png'),
          (await win.webContents.capturePage()).toPNG()
        );
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
      JSON.stringify({ root, out, helper: path.join(root, '.test-tools/PrivateDesktop.exe') }) +
      ');'
  );
  const [dir] = await require('@electron/packager').packager({
    dir: source,
    name: 'NativeGpuPerformanceFixture',
    executableName: 'NativeGpuPerformanceFixture',
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
      JSON.stringify(path.join(dir, 'NativeGpuPerformanceFixture.exe')) +
      ',[],{windowsHide:true,stdio:"inherit",timeout:70000});'
  );
  try {
    execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
      stdio: 'inherit',
      windowsHide: true,
      timeout: 75000,
    });
  } finally {
    for (const name of ['result.json', 'failure.txt'])
      if (fs.existsSync(path.join(out, name)))
        console.log(fs.readFileSync(path.join(out, name), 'utf8'));
    console.log(out);
  }
  if (!fs.existsSync(path.join(out, 'result.json')))
    throw Error('Owned native performance probe failed');
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
