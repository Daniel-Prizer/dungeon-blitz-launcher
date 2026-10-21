'use strict';
// Shared production WebView2 surface in a genuine, independently compiled QA
// executable. Fresh anonymous title only; no saved or authenticated profile.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const { execFileSync, spawn } = require('node:child_process'),
  root = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 600; i++) {
    const v = await fn();
    if (v) return v;
    await wait(100);
  }
  throw Error('Timed out: ' + label);
}
async function build() {
  const out = fs.mkdtempSync(path.join(root, 'artifacts/multiplayer-gpu-')),
    stage = JSON.parse(fs.readFileSync(path.join(root, '.test-tools/release-stage.json'))).stage,
    config = path.join(out, 'fixture.json');
  const runtime = path.join(stage, 'runtime/modern'),
    libs = ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll'];
  for (const n of [...libs, 'WebView2Loader.dll'])
    fs.copyFileSync(path.join(runtime, n), path.join(out, n));
  const executable = path.join(out, 'MultiplayerCompatibilityFixture.exe');
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
      ...libs.map((n) => '/r:' + path.join(out, n)),
      '/out:' + executable,
      path.join(root, 'src/gpu/GameHost.cs'),
      path.join(root, 'src/gpu/NativeGameView.cs'),
      path.join(root, 'research/gpu/SceneRenderClient.cs'),
    ],
    { stdio: 'inherit', windowsHide: true }
  );
  fs.writeFileSync(config, JSON.stringify({ out, stage, executable }));
  const runner = path.join(out, 'run.cjs'),
    log = path.join(out, 'test.log');
  fs.writeFileSync(
    runner,
    `const fs=require('fs');console.log=(...v)=>fs.appendFileSync(${JSON.stringify(log)},v.map(x=>x?.stack||String(x)).join(' ')+'\\n');console.error=console.log;process.argv=[process.argv[0],${JSON.stringify(__filename)},'--run',${JSON.stringify(config)}];require(${JSON.stringify(__filename)});`
  );
  try {
    execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
      windowsHide: true,
      stdio: 'inherit',
      timeout: 160000,
    });
  } finally {
    if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log));
  }
}
async function run(file) {
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), ['--check'], {
    windowsHide: true,
  });
  const { out, stage, executable } = JSON.parse(fs.readFileSync(file));
  let hostConfig;
  class Loader extends EventEmitter {
    constructor(...args) {
      super();
      hostConfig = args[6].config;
    }
    close() {}
    configure() {}
    resize() {}
  }
  require.cache[require.resolve('../src/legacy-runtime.cjs')] = {
    exports: { LegacyRuntime: Loader },
  };
  const { ModernRuntime } = require('../src/modern-runtime.cjs');
  const planner = new ModernRuntime(
    path.join(stage, 'runtime'),
    Buffer.alloc(8),
    true,
    true,
    'https://dungeonblitzr.theminesa.studio/'
  );
  planner.on('failure', (e) => {
    throw Error(e);
  });
  await until(() => hostConfig, 'prepared multiplayer configuration');
  const config = JSON.parse(fs.readFileSync(hostConfig));
  assert.equal(config.sourceHash, require('../src/gpu/adapter.json').sourceSha256);
  assert(config.patchedHash);
  config.profile = path.join(out, 'empty-web-profile');
  config.privateOutput = out;
  const hostFile = path.join(out, 'host.json');
  fs.writeFileSync(hostFile, JSON.stringify(config));
  let child, pipe;
  const token = crypto.randomBytes(32).toString('hex'),
    channel = '\\\\.\\pipe\\blitz-game-' + crypto.randomBytes(16).toString('hex'),
    messages = [];
  const server = net.createServer((socket) => {
    pipe = socket;
    let b = '';
    socket.on('error', () => {});
    socket.on('data', (part) => {
      b += part;
      while (b.includes('\n')) {
        const i = b.indexOf('\n'),
          m = JSON.parse(b.slice(0, i));
        b = b.slice(i + 1);
        if (m.type === 'auth') assert.equal(m.token, token);
        else messages.push(m);
      }
    });
  });
  await new Promise((r) => server.listen(channel, r));
  try {
    const env = require('../src/game-environment.cjs').gameEnvironment(process.env, true);
    Object.assign(env, {
      BLITZ_HOST_TEST: '1',
      BLITZ_CURSOR_DRY_RUN: '1',
      BLITZ_HOST_CHANNEL: channel,
      BLITZ_HOST_TOKEN: token,
      BLITZ_GPU_CONFIG: hostFile,
    });
    child = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
    await until(() => messages.some((m) => m.type === 'ready'), 'WebView2 ready');
    const send = (m) => pipe.write(JSON.stringify(m) + '\n');
    for (const m of [
      {
        type: 'settings',
        value: require('../src/policy.cjs').validSettings({
          gameRenderer: 'gpu',
          experimentalWidescreen: true,
          centeredCamera: true,
          showFPS: true,
          autoUpdates: false,
        }),
      },
      { type: 'viewport', width: 1600, height: 900 },
      { type: 'visibility', value: true },
      { type: 'focus' },
    ])
      send(m);
    await until(
      () => messages.some((m) => m.type === 'client-integration' && m.value),
      'fresh multiplayer client/engine integration'
    );
    await until(
      () => messages.some((m) => m.type === 'audio-integration' && m.value),
      'native audio bridge'
    );
    await wait(4000);
    send({ type: 'research', action: 'inspect', id: 'inspect' });
    const inspect = await until(
      () => messages.find((m) => m.type === 'research-result' && m.id === 'inspect'),
      'native scene bridge'
    );
    assert(!inspect.error);
    const value = inspect.result?.result?.value;
    assert(value?.player && value?.structure, 'Native scene bridge must initialize');
    assert.deepEqual(value.errors, []);
    send({ type: 'research', action: 'audio-state', id: 'audio' });
    const audio = await until(() => messages.find((m) => m.id === 'audio'), 'sound categories');
    assert(audio.result?.result?.value?.initialized);
    send({
      type: 'research',
      action: 'capture',
      id: 'capture',
      world: true,
      name: 'fresh-gpu-multiplayer-title',
    });
    await until(() => messages.find((m) => m.id === 'capture'), 'owned window capture');
    assert(fs.statSync(path.join(out, 'fresh-gpu-multiplayer-title.png')).size > 100000);
    assert(!messages.some((m) => m.type === 'error'));
    assert(
      !messages.some((m) => m.type === 'gpu-status' && /needs review/.test(m.status?.reason || ''))
    );
    fs.writeFileSync(
      path.join(out, 'receipt.json'),
      JSON.stringify(
        {
          ok: true,
          source: config.sourceHash,
          scope:
            'Fresh anonymous multiplayer title, real shared WebView2 host, native GPU bridge/audio initialization and owned-window pixels; no login/combat FPS claim',
          inspect: value,
          audio: audio.result.result.value,
        },
        null,
        2
      )
    );
    send({ type: 'quit' });
    await new Promise((r) => child.once('exit', r));
    child = null;
    console.log('PASS fresh multiplayer GPU runtime and native bridge: ' + out);
  } finally {
    if (child && pipe) {
      pipe.write('{"type":"quit"}\n');
      await new Promise((r) => child.once('exit', r));
    }
    pipe?.destroy();
    await new Promise((r) => server.close(r));
    planner.close();
  }
}
(process.argv[2] === '--run' ? run(process.argv[3]) : build()).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
