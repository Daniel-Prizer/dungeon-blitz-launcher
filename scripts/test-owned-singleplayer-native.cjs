'use strict';
// Package the shared host as a separate Electron fixture, without a production EXE.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  net = require('node:net'),
  crypto = require('node:crypto');
const { execFileSync, spawn, fork } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  { Singleplayer } = require('../src/singleplayer.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error('Timed out: ' + label);
}
async function build() {
  require('../research/gpu/background.cjs').lowerSelf();
  const out = fs.mkdtempSync(path.join(root, 'artifacts/local-world-native-')),
    source = path.join(out, 'source');
  fs.mkdirSync(source);
  fs.cpSync(path.join(root, 'src/legacy'), path.join(source, 'legacy'), { recursive: true });
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({
      name: 'local-world-compatibility-fixture',
      version: '1.0.0',
      main: 'entry.cjs',
    })
  );
  fs.writeFileSync(
    path.join(source, 'entry.cjs'),
    `const {app}=require('electron');const setPath=app.setPath.bind(app);app.setPath=(n,v)=>setPath(n,n==='userData'?${JSON.stringify(path.join(out, 'disposable-game-profile'))}:v);require('./legacy/main.cjs');`
  );
  const stageFile = path.join(root, '.test-tools/release-stage.json'),
    runtime = fs.existsSync(stageFile)
      ? path.join(JSON.parse(fs.readFileSync(stageFile)).stage, 'runtime/game/resources')
      : path.join(root, 'runtime/game/resources');
  const resources = fs
    .readdirSync(runtime)
    .filter((n) => n.endsWith('.json') || ['pepflashplayer64.dll', 'game-window.node'].includes(n));
  const builds = await require('@electron/packager').packager({
    dir: source,
    name: 'LocalWorldCompatibilityFixture',
    executableName: 'LocalWorldCompatibilityFixture',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '11.5.0',
    out: path.join(out, 'package'),
    asar: true,
    extraResource: [...resources.map((n) => path.join(runtime, n)), path.join(root, 'src/gpu')],
    win32metadata: {
      ProductName: 'Local World Compatibility Fixture',
      FileDescription: 'Isolated local game compatibility fixture',
    },
  });
  const config = path.join(out, 'config.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      out,
      executable: path.join(builds[0], 'LocalWorldCompatibilityFixture.exe'),
      multiplayer: process.argv.includes('--multiplayer') || process.argv.includes('--gpu'),
      gpu: process.argv.includes('--gpu'),
      fallbackHash: process.argv
        .find((value) => value.startsWith('--expect-native-fallback='))
        ?.split('=')[1],
    })
  );
  launchPrivate(config);
}
function launchPrivate(config) {
  config = path.resolve(config);
  const { out } = JSON.parse(fs.readFileSync(config)),
    runner = path.join(out, 'run.cjs'),
    log = path.join(out, 'test.log');
  fs.writeFileSync(log, '');
  fs.writeFileSync(
    runner,
    `const fs=require('fs');console.log=(...v)=>fs.appendFileSync(${JSON.stringify(log)},v.map(x=>x?.stack||String(x)).join(' ')+'\\n');console.error=console.log;process.argv=[process.argv[0],${JSON.stringify(__filename)},'--run',${JSON.stringify(config)}];require(${JSON.stringify(__filename)});`
  );
  try {
    execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
      windowsHide: true,
      stdio: 'inherit',
      timeout: 150000,
    });
  } finally {
    if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log));
  }
}
async function run(config) {
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), ['--check'], {
    windowsHide: true,
  });
  const {
    out,
    executable,
    multiplayer = false,
    gpu = false,
    fallbackHash,
  } = JSON.parse(fs.readFileSync(config));
  if (fallbackHash) assert(gpu && multiplayer && /^[a-f0-9]{64}$/.test(fallbackHash));
  const local = new Singleplayer({
    bundle: path.join(root, 'runtime/singleplayer'),
    dataDir: path.join(out, 'disposable-world'),
    fork: (entry, args, options) =>
      fork(entry, args, {
        ...options,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        windowsHide: true,
      }),
  });
  let child, pipe;
  const token = crypto.randomBytes(32).toString('hex'),
    channel = '\\\\.\\pipe\\local-world-fixture-' + crypto.randomBytes(16).toString('hex'),
    messages = [];
  const server = net.createServer((socket) => {
    pipe = socket;
    let buffer = '';
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const i = buffer.indexOf('\n'),
          line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        const message = JSON.parse(line);
        if (message.type === 'auth') assert.equal(message.token, token);
        else messages.push(message);
      }
    });
  });
  await new Promise((r) => server.listen(channel, r));
  try {
    const connection = multiplayer
        ? { url: 'https://dungeonblitzr.theminesa.studio/' }
        : await local.start(),
      env = require('../src/game-environment.cjs').gameEnvironment(process.env, true);
    Object.assign(env, {
      BLITZ_HOST_TEST: '1',
      BLITZ_CURSOR_DRY_RUN: '1',
      BLITZ_GAME_URL: connection.url,
      BLITZ_GAME_ACCELERATION: '0',
      BLITZ_HOST_CHANNEL: channel,
      BLITZ_HOST_TOKEN: token,
    });
    if (connection.ports) env.BLITZ_SINGLEPLAYER_PORTS = JSON.stringify(connection.ports);
    if (gpu) Object.assign(env, { BLITZ_NATIVE_GPU: '1', BLITZ_GAME_ACCELERATION: '1' });
    child = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
    await until(() => messages.some((m) => m.type === 'ready'), 'native host ready');
    const send = (m) => pipe.write(JSON.stringify(m) + '\n');
    if (gpu) send({ type: 'gpu-config', cap: 1000, enabled: true });
    for (const m of [
      { type: 'test-viewport', width: 1600, height: 900 },
      { type: 'zoom', value: 1 },
      { type: 'widescreen', value: true },
      { type: 'centered-camera', value: true },
      { type: 'shift-mount', value: true },
      { type: 'autorun', value: true, key: 'ö' },
      { type: 'show-fps', value: true },
      { type: 'audio-mix', value: { player: 100, music: 37, environment: 60, creatures: 80 } },
      { type: 'visibility', value: true },
    ])
      send(m);
    await until(
      () => messages.some((m) => m.type === 'client-integration' && m.value),
      'guarded client interception'
    );
    await wait(8000);
    // Open the native login form; never authenticate or reuse a saved account.
    send({ type: 'focus' });
    await wait(300);
    send({ type: 'test-input', input: { type: 'mouseMove', x: 280, y: 830 } });
    await wait(100);
    for (const type of ['mouseDown', 'mouseUp']) {
      send({ type: 'test-input', input: { type, x: 280, y: 830, button: 'left', clickCount: 1 } });
      await wait(100);
    }
    await wait(1500);
    const capture = path.join(
      out,
      multiplayer ? 'fresh-multiplayer-title.png' : 'owned-local-title.png'
    );
    send({ type: 'capture', path: capture });
    await until(() => fs.existsSync(capture + '.json') && fs.existsSync(capture), 'native capture');
    const result = JSON.parse(fs.readFileSync(capture + '.json'));
    assert.equal(
      result.testClientHash,
      fallbackHash ||
        (multiplayer
          ? 'a2326bf2b9d4b7d4697bf9f2601d3be8a33cd6a017784ed92ea95d9f6020099c'
          : require('../src/legacy/client-singleplayer.json').inputHash)
    );
    assert(result.clientIntegration && result.audioIntegration);
    assert(result.renderProbe);
    assert.equal(result.renderProbe.centeredCamera, true);
    assert(result.audioProbe?.initialized);
    assert(result.renderProbe.widescreen.requested);
    assert(
      !result.testRequests.some(
        (r) => r.error && r.error !== 'net::OK' && /UI_|Levels|DungeonBlitz/.test(r.path)
      ),
      JSON.stringify(result.testRequests)
    );
    assert(fs.statSync(capture).size > 40000);
    assert(
      !messages.some((m) => m.type === 'error'),
      JSON.stringify(messages.filter((m) => m.type === 'error'))
    );
    if (gpu) {
      assert(
        result.geometry.nativeGpuFrontend,
        'Native GPU module loaded: ' + JSON.stringify(result.geometry.nativeGpu)
      );
      if (fallbackHash) {
        assert.equal(result.geometry.nativeGpu.client, false);
        assert.equal(result.geometry.nativeGpu.artwork, false);
        assert.match(result.geometry.nativeGpu.reason, /changed; Original rendering is retained/);
        assert.equal(result.geometry.nativeGpu.frontendError, '');
        assert.deepEqual(result.geometry.nativeGpu.console, []);
      } else
        assert.deepEqual(result.geometry.nativeGpu, {
          client: true,
          page: true,
          artwork: true,
          reason: '',
          frontendError: '',
          console: [],
        });
      assert(
        messages.some((m) => m.type === 'gpu-status' && m.status.backend === 'native-flash-webgl2')
      );
    }
    send({ type: 'quit' });
    await new Promise((r) => child.once('exit', r));
    child = null;
    await local.stop();
    fs.writeFileSync(
      path.join(out, multiplayer ? 'multiplayer-receipt.json' : 'receipt.json'),
      JSON.stringify(
        {
          ok: true,
          scope:
            'Shared original Flash host source, fresh reviewed client, unauthenticated title, inactive desktop; no OS input/confinement or production executable',
          result,
        },
        null,
        2
      )
    );
    console.log(
      'PASS native ' +
        (multiplayer ? 'fresh multiplayer' : 'owned singleplayer') +
        ' title and enhancement contract: ' +
        out
    );
  } finally {
    if (child && pipe) {
      pipe.write(JSON.stringify({ type: 'quit' }) + '\n');
      await new Promise((r) => child.once('exit', r));
    }
    pipe?.destroy();
    await new Promise((r) => server.close(r));
    await local.stop();
  }
}
(process.argv[2] === '--run'
  ? run(process.argv[3])
  : process.argv[2] === '--existing'
    ? Promise.resolve().then(() => launchPrivate(process.argv[3]))
    : build()
).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
