'use strict';
// Shared WebView2 host on its own inactive desktop, profile and account. No
// production launcher/game, OS input, external debugging port or browser focus.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  crypto = require('node:crypto'),
  readline = require('node:readline'),
  { spawn, execFileSync } = require('node:child_process');
const { publicBytes } = require('../src/game-source.cjs'),
  { adaptGpuClient } = require('../src/gpu/client-adapter.cjs'),
  { readMessages } = require('../src/legacy/transport.cjs'),
  { validSettings } = require('../src/policy.cjs'),
  background = require('../research/gpu/background.cjs');
background.lowerSelf();
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-tools/scene-render-client'),
  privateRoot = process.env.BLITZ_GPU_QA_ROOT,
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
  if (!privateRoot || !path.isAbsolute(privateRoot))
    throw Error('Explicit own-account QA directory required');
  require('./prepare-modern.cjs')();
  fs.mkdirSync(out, { recursive: true });
  for (const file of [
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    'WebView2Loader.dll',
  ])
    fs.copyFileSync(path.join(root, 'runtime/modern', file), path.join(out, file));
  const executable = path.join(out, 'SceneRenderClient.exe');
  execFileSync(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    [
      '/nologo',
      '/target:winexe',
      '/platform:x64',
      '/define:GPU_PRIVATE_QA',
      '/main:SceneRenderClient',
      '/r:System.Net.Http.dll',
      '/r:System.Web.Extensions.dll',
      '/r:System.Drawing.dll',
      '/r:System.Windows.Forms.dll',
      ...['Core', 'WinForms'].map(
        (n) => '/r:' + path.join(out, 'Microsoft.Web.WebView2.' + n + '.dll')
      ),
      '/out:' + executable,
      path.join(root, 'src/gpu/GameHost.cs'),
      path.join(root, 'src/gpu/NativeGameView.cs'),
      path.join(root, 'research/gpu/SceneRenderClient.cs'),
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 30000 }
  );
  const recipe = require('../src/gpu/adapter.json'),
    url = 'https://dungeonblitz.theminesa.studio/web',
    html = (await publicBytes(url, 1024 * 1024)).toString(),
    match = html.match(/\/p\/[a-z]{3}\/DungeonBlitz\.swf\?[^\s"'<>`$]+/);
  if (!match) throw Error('Public game source not found');
  const source = await publicBytes(new URL(match[0], url).href, 4 * 1024 * 1024);
  let patched = adaptGpuClient(source, recipe);
  if (!patched) throw Error('Fresh GPU adapter refused');
  const productionClient = path.join(out, 'production-client.swf'),
    probeClient = path.join(out, 'probe-client.swf'),
    probeSource = path.join(out, 'BlitzInput.as');
  fs.writeFileSync(productionClient, patched);
  const inputSource = fs.readFileSync(path.join(root, 'src/legacy/BlitzInput.as'), 'utf8'),
    probe = inputSource
      .replace(
        'ExternalInterface.addCallback("BlitzMount",Mount);',
        'ExternalInterface.addCallback("OwnRunProbe",OwnRunProbe);ExternalInterface.addCallback("BlitzMount",Mount);'
      )
      .replace(
        'public static function SetMountShortcut',
        'public static function OwnRunProbe():Object {var game:Game=CurrentGame();return {active:runningKey!=0,key:runningKey,held:runningGame&&runningGame.var_406&&runningGame.var_406.indexOf(runningCommand)>=0,context:game!=null,x:game&&game.clientEnt?game.clientEnt.physPosX:0,direction:runningCommand==Game.const_153?"left":runningCommand==Game.const_151?"right":"none"};}\n  public static function SetMountShortcut'
      );
  if (probe === inputSource) throw Error('Private readonly input probe not attached');
  fs.writeFileSync(probeSource, probe);
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
      '-replace',
      productionClient,
      probeClient,
      'BlitzInput',
      probeSource,
    ],
    { windowsHide: true, stdio: 'inherit', timeout: 120000 }
  );
  const { readSWF } = require('../src/legacy/swf-contract.cjs'),
    before = readSWF(patched),
    after = readSWF(fs.readFileSync(probeClient));
  if (before.tags.length !== after.tags.length || !before.preamble.equals(after.preamble))
    throw Error('Private probe changed native structure');
  for (let i = 0; i < before.tags.length; i++)
    if (
      !before.tags[i].abc?.bodies.some((b) => b.name?.startsWith('BlitzInput.')) &&
      !before.tags[i].raw.equals(after.tags[i].raw)
    )
      throw Error('Private probe changed another native tag');
  patched = fs.readFileSync(probeClient);
  const client = path.join(out, 'client.swf'),
    config = path.join(out, 'config.json'),
    resources = path.join(out, 'resources');
  fs.cpSync(path.join(root, 'runtime/modern/resources'), resources, { recursive: true });
  // Only the private copy admits destruction of its own device for recovery QA.
  const workerFile = path.join(resources, 'render-worker.mjs');
  fs.writeFileSync(
    workerFile,
    fs
      .readFileSync(workerFile, 'utf8')
      .replace(
        "}else if(action==='stop')",
        "}else if(action==='device-loss'){renderer.device.destroy();send({id,result:status()});}else if(action==='stop')"
      )
  );
  const sessionFile = path.join(resources, 'session.mjs');
  fs.writeFileSync(
    sessionFile,
    fs
      .readFileSync(sessionFile, 'utf8')
      .replace('this.current={cancel:', "this.current={lose:()=>request('device-loss'),cancel:")
  );
  const entryFile = path.join(resources, 'entry.mjs');
  fs.writeFileSync(
    entryFile,
    fs
      .readFileSync(entryFile, 'utf8')
      .replace('void session.start();', 'globalThis.__ownGpuSession=session;void session.start();')
  );
  fs.writeFileSync(client, patched);
  fs.writeFileSync(
    config,
    JSON.stringify({
      url,
      resources,
      nativeHost: path.join(root, 'runtime/NativeHost.exe'),
      profile: path.join(privateRoot, 'webview-profile'),
      sourceHash: recipe.sourceSha256,
      patched: client,
      patchedHash: hash(patched),
      engineHash: '5822ddb03354ef0bf3ecaac38d52516ec2a616124be1f10f38ca5d2a9d64508f',
      privateOutput: privateRoot,
      privateCredentials: path.join(privateRoot, 'credentials.private.json'),
    })
  );
  const env = require('../src/game-environment.cjs').gameEnvironment(process.env, true);
  env.BLITZ_HOST_CHANNEL = '\\\\.\\pipe\\blitz-game-' + crypto.randomBytes(24).toString('hex');
  env.BLITZ_HOST_TOKEN = crypto.randomBytes(32).toString('hex');
  env.BLITZ_GPU_CONFIG = config;
  env.BLITZ_GAME_ACCELERATION = '1';
  let socket,
    latest,
    child,
    nextRequest = 0,
    matrixRunning = false;
  const events = [],
    nativeLines = [],
    tasks = new Map();
  const send = (message) => socket?.write(JSON.stringify(message) + '\n'),
    server = net.createServer((peer) => {
      let authenticated = false;
      peer.on('error', () => {});
      readMessages(peer, (message) => {
        if (!authenticated) {
          if (message.type !== 'auth' || message.token !== env.BLITZ_HOST_TOKEN || socket) {
            peer.destroy();
            return;
          }
          socket = peer;
          authenticated = true;
          return;
        }
        if (message.type === 'gpu-status') latest = message.status;
        else if (message.type === 'ready') {
          console.log('READY owned inactive WebView2 client ' + message.chromium);
          send({ type: 'visibility', value: true });
          send({
            type: 'settings',
            value: validSettings({
              gameRenderer: 'gpu',
              gpuFrameCap: 1000,
              experimentalWidescreen: true,
              centeredHotbar: true,
              centeredCamera: true,
            }),
          });
        } else if (message.type === 'research-result') {
          const task = tasks.get(message.id);
          if (task) {
            tasks.delete(message.id);
            clearTimeout(task.timer);
            if (message.error) task.reject(Error(message.error));
            else task.resolve(message.result?.result?.value ?? message.result);
          } else console.log(JSON.stringify(message));
        } else if (message.type === 'research-native') {
          nativeLines.push(message.line);
          if (nativeLines.length > 100) nativeLines.shift();
        } else if (events.length < 100) {
          events.push(
            message.type === 'original-pointer' ? { type: message.type, available: true } : message
          );
          if (message.type !== 'original-pointer') console.log(JSON.stringify(message));
        }
      });
    });
  server.maxConnections = 1;
  await new Promise((r) => server.listen(env.BLITZ_HOST_CHANNEL, r));
  const rpc = (c) =>
      new Promise((resolve, reject) => {
        const id = ++nextRequest,
          timer = setTimeout(() => {
            tasks.delete(id);
            reject(Error('Research operation timed out: ' + c.action));
          }, 20000);
        tasks.set(id, { resolve, reject, timer });
        send({ type: 'research', ...c, id });
      }),
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    settings = (patch) =>
      send({
        type: 'settings',
        value: validSettings({
          gameRenderer: 'gpu',
          gpuFrameCap: 1000,
          experimentalWidescreen: true,
          centeredHotbar: true,
          centeredCamera: true,
          ...patch,
        }),
      });
  const until = async (test, label, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await test();
      if (value) return value;
      await wait(150);
    }
    throw Error(label);
  };
  async function matrix() {
    if (matrixRunning) throw Error('Matrix already running');
    matrixRunning = true;
    const record = {
      passed: false,
      checkedAt: new Date().toISOString(),
      checks: [],
      scope:
        'Separate own-account shared WebView2 host, actual inactive-desktop focus and native placement; cursor dry run; no input-desktop/OS keyboard/pointer operations',
    };
    const check = (value, label) => {
      if (!value) throw Error(label);
      record.checks.push(label);
    };
    try {
      await rpc({ action: 'native-host' });
      await until(() => nativeLines.includes('READY'), 'Native attachment did not acknowledge');
      await rpc({ action: 'native-layout', layout: 'fullscreen' });
      settings({ autorun: false });
      await wait(250);
      settings({ autorun: true });
      await wait(250);
      let state = await until(
        async () => {
          const s = await rpc({ action: 'run-state' });
          return s?.state?.context === true ? s : null;
        },
        'Native playable context did not initialize',
        30000
      );
      check(state.mode === 'transparent', 'Actual playable native context and transparent runtime');
      send({ type: 'focus' });
      await wait(300);
      await rpc({ action: 'autorun-key' });
      await wait(500);
      const run = await rpc({ action: 'run-state' });
      check(run.state.active && run.state.held, 'Ö activates the original held movement command');
      const sink = await rpc({ action: 'focus-away' });
      await wait(700);
      const background = await rpc({ action: 'run-state' });
      record.autorun = { before: run, background, sink };
      check(
        !background.focused &&
          background.state.active &&
          background.state.held &&
          background.state.direction === run.state.direction,
        'Autorun retains its selected native command during real separate-window deactivation'
      );
      send({ type: 'focus' });
      await wait(300);
      await rpc({ action: 'press', key: 'ArrowRight' });
      await wait(200);
      state = await rpc({ action: 'run-state' });
      check(!state.state.active, 'Manual movement releases autorun');
      await rpc({ action: 'press', key: 'ArrowLeft' });
      await wait(200);
      await rpc({ action: 'autorun-key' });
      await wait(500);
      const movingBefore = await rpc({ action: 'run-state' });
      await rpc({ action: 'focus-away' });
      await wait(1800);
      const movingAfter = await rpc({ action: 'run-state' });
      record.backgroundMovement = { before: movingBefore, after: movingAfter };
      check(
        !movingAfter.focused &&
          movingAfter.state.active &&
          movingAfter.state.held &&
          movingAfter.state.direction === 'left' &&
          movingAfter.state.x < movingBefore.state.x - 10,
        'Actual native player position advances left while the separate game window is unfocused'
      );
      send({ type: 'focus' });
      await wait(300);
      await rpc({ action: 'press', key: 'ArrowRight' });
      await wait(200);
      settings({ autorunKey: 'F8', gpuFrameCap: 240 });
      await wait(400);
      await rpc({ action: 'autorun-key' });
      await wait(200);
      state = await rpc({ action: 'run-state' });
      check(!state.state.active, 'Saved replacement leaves Ö as an ordinary key');
      await rpc({ action: 'autorun-key', key: 'F8' });
      await wait(250);
      state = await rpc({ action: 'run-state' });
      check(state.state.active && state.state.held, 'Saved physical replacement activates autorun');
      send({ type: 'visibility', value: false });
      await wait(500);
      state = await rpc({ action: 'run-state' });
      check(!state.state.active, 'Explicit hide releases autorun');
      send({ type: 'visibility', value: true });
      send({ type: 'focus' });
      await wait(300);
      settings({ gpuFrameCap: 240 });
      await until(
        () => latest?.phase === 'gpu' && latest.completedFrames > 100,
        'GPU did not resume after hide'
      );
      const a = structuredClone(latest);
      await wait(3500);
      const b = structuredClone(latest);
      const fps = ((b.completedFrames - a.completedFrames) * 1000) / (b.elapsedMs - a.elapsedMs);
      check(
        a.generation === b.generation && fps > 100 && fps <= 245,
        'Actual 240 cap bounds completed changing frames'
      );
      record.cap240FPS = fps;
      const generation = latest.generation;
      await rpc({ action: 'device-loss' });
      await until(
        () =>
          latest?.generation > generation && latest?.phase === 'gpu' && latest.completedFrames > 30,
        'GPU did not recover after actual own-device loss',
        25000
      );
      check(
        true,
        'Actual device destruction restores native rendering and recreates a working GPU stream'
      );
      record.deviceLossGeneration = latest.generation;
      settings({
        gpuFrameCap: 30,
        audioMix: { player: 23, music: 0, environment: 44, creatures: 77 },
        crosshair: { style: 'original', color: '#ff00ff', size: 24, outline: true },
      });
      await wait(600);
      const mix = await rpc({ action: 'audio-state' });
      check(
        mix?.levels?.player === 0.23 &&
          mix.levels.music === 0 &&
          mix.levels.environment === 0.44 &&
          mix.levels.creatures === 0.77,
        'Original four native audio categories receive the saved mix'
      );
      await rpc({ action: 'native-host' });
      await until(() => nativeLines.includes('READY'), 'Native attachment did not acknowledge');
      for (const layout of ['windowed', 'fullscreen', 'small']) {
        const start = nativeLines.length;
        await rpc({ action: 'native-layout', layout });
        const line = await until(
          () => nativeLines.slice(start).find((l) => l.startsWith('WINDOWTEST ')),
          'Native layout verification omitted'
        );
        const result = JSON.parse(line.slice(11));
        check(
          result.dryRun &&
            JSON.stringify(result.actual) === JSON.stringify(result.expected) &&
            result.hits.every((h) => h.ok && h.hit === 1),
          'Native HWND placement and HTCLIENT: ' + layout
        );
        (record.windows ??= []).push(result);
      }
      await rpc({ action: 'audio-fixture' });
      await rpc({ action: 'native-volume' });
      const audio = await until(() => {
        for (const line of [...nativeLines].reverse())
          if (line.startsWith('AUDIO ')) {
            const value = JSON.parse(line.slice(6));
            if (
              value.requested === 37 &&
              value.sessions?.length &&
              value.sessions.every((s) => Math.abs(s.volume - 0.37) < 0.0001)
            )
              return value;
          }
        return null;
      }, 'Own WebView2 audio process-tree volume did not verify');
      record.audio = audio;
      check(true, 'Silent actual WebView2 descendant audio sessions read back 37 percent');
      settings({ gpuFrameCap: 1000 });
      const oldGeneration = latest.generation;
      await rpc({ action: 'native-layout', layout: 'fullscreen' });
      await until(
        () =>
          latest?.generation > oldGeneration &&
          latest?.phase === 'gpu' &&
          latest.completedFrames > 30,
        'GPU did not restore final viewport'
      );
      await rpc({ action: 'capture', name: 'native-feature-matrix-final', world: true });
      record.finalGpu = latest;
      record.passed = true;
      console.log('PASS native feature matrix ' + record.checks.length + ' checks');
    } catch (error) {
      record.error = error.message;
      record.nativeAudio = nativeLines.filter((l) => l.startsWith('AUDIO '));
      console.log('FAIL native feature matrix: ' + error.message);
    } finally {
      fs.writeFileSync(path.join(out, 'feature-matrix.json'), JSON.stringify(record, null, 2));
      matrixRunning = false;
    }
  }
  const desktopSource = path.join(out, 'ResearchDesktop.cs'),
    desktop = path.join(out, 'ResearchDesktop.exe');
  fs.writeFileSync(
    desktopSource,
    fs
      .readFileSync(path.join(root, 'scripts/PrivateDesktop.cs'), 'utf8')
      .replace(
        'WaitForSingleObject(child.process,240000)',
        'WaitForSingleObject(child.process,600000)'
      )
  );
  execFileSync(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    ['/nologo', '/target:exe', '/platform:x64', '/out:' + desktop, desktopSource],
    { windowsHide: true }
  );
  child = spawn(desktop, [executable, config], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (b) => process.stderr.write(b));
  child.stdout.on('data', (b) => process.stdout.write(b));
  child.on('exit', (code) => {
    console.log('OWNED CLIENT CLOSED ' + code);
    socket?.destroy();
    server.close();
    process.exit(code || 0);
  });
  background.lowerOwnedChildren();
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    try {
      if (line.length > 4096) throw Error('Command bound');
      const c = JSON.parse(line);
      if (c.action === 'status') {
        const record = { gpu: latest, events: events.length, checkedAt: new Date().toISOString() };
        fs.writeFileSync(path.join(out, 'latest-stats.json'), JSON.stringify(record, null, 2));
        console.log(JSON.stringify(record));
        return;
      }
      if (c.action === 'native-audio') {
        console.log(JSON.stringify(nativeLines.filter((l) => l.startsWith('AUDIO '))));
        return;
      }
      if (c.action === 'close') {
        send({ type: 'quit' });
        return;
      }
      if (matrixRunning) throw Error('Matrix running');
      if (c.action === 'matrix') {
        if (c.confirmedOwnWorld !== true)
          throw Error('Confirm the owned character screenshot first');
        void matrix();
        return;
      }
      if (c.action === 'settings') {
        settings(c.value || {});
        return;
      }
      if (c.action === 'focus') {
        send({ type: 'focus' });
        return;
      }
      if (c.action === 'resize') {
        send({ type: 'viewport', width: c.width, height: c.height });
        return;
      }
      if (c.action === 'visibility') {
        send({ type: 'visibility', value: c.value });
        return;
      }
      if (c.action === 'cap') {
        settings({ gpuFrameCap: c.value });
        return;
      }
      send({ ...c, type: 'research' });
    } catch (error) {
      console.log('Research command refused: ' + error.message);
    }
  });
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
