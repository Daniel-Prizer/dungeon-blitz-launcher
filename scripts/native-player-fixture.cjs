'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

function privateRun(config, suite, environment = {}) {
  const runner = path.join(config.out, 'run.cjs');
  fs.writeFileSync(
    runner,
    `require(${JSON.stringify(__filename)}).run(${JSON.stringify(config)},${suite.toString()}).catch(error=>{console.error(error);process.exitCode=1;});`
  );
  execFileSync(
    path.join(config.root, '.test-tools/PrivateDesktop.exe'),
    [process.execPath, runner],
    {
      stdio: 'inherit',
      windowsHide: true,
      timeout: (config.runtimeBudgetMs || 45000) + 15000,
      env: { ...process.env, ...environment },
    }
  );
}

function privateRunAsync(config, suite, environment = {}) {
  const runner = path.join(config.out, 'run.cjs');
  fs.writeFileSync(
    runner,
    `require(${JSON.stringify(__filename)}).run(${JSON.stringify(config)},${suite.toString()}).catch(error=>{console.error(error);process.exitCode=1;});`
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      path.join(config.root, '.test-tools/PrivateDesktop.exe'),
      [process.execPath, runner],
      { stdio: 'inherit', windowsHide: true, env: { ...process.env, ...environment } }
    );
    const timer = setTimeout(
      () => {
        child.kill();
        reject(Error('Private fixture helper timed out'));
      },
      (config.runtimeBudgetMs || 45000) + 15000
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error('Private fixture exit: ' + code));
    });
  });
}

async function run(config, suite) {
  const runtimeBudgetMs = config.runtimeBudgetMs || 45000;
  if (!Number.isInteger(runtimeBudgetMs) || runtimeBudgetMs < 1000 || runtimeBudgetMs > 240000)
    throw Error('Invalid owned runtime budget');
  execFileSync(path.join(config.root, '.test-tools/PrivateDesktop.exe'), ['--check'], {
    windowsHide: true,
  });
  if (!process.env.BLITZ_PRIVATE_DESKTOP?.startsWith('BlitzTest-'))
    throw Error('Private desktop required');
  const log = path.join(config.out, 'console.log');
  let hostServer,
    hostSocket,
    hostReady = Promise.resolve(),
    hostEvents = [];
  const hostEnvironment = {};
  if (config.hosted) {
    const net = require('node:net'),
      crypto = require('node:crypto');
    const token = crypto.randomBytes(32).toString('hex');
    hostEnvironment.BLITZ_HOST_CHANNEL =
      '\\\\.\\pipe\\blitz-game-' + crypto.randomBytes(24).toString('hex');
    hostEnvironment.BLITZ_HOST_TOKEN = token;
    hostEnvironment.BLITZ_HOST_TEST = '1';
    if (config.production) hostEnvironment.BLITZ_NATIVE_PLAYER = '120';
    let ready, fail;
    hostReady = new Promise((resolve, reject) => {
      ready = resolve;
      fail = reject;
    });
    const timeout = setTimeout(() => fail(Error('Owned host did not become ready')), 6000);
    hostServer = net.createServer((socket) => {
      let authenticated = false;
      hostSocket = socket;
      socket.on('error', () => {});
      require(path.join(config.root, 'src/legacy/transport.cjs')).readMessages(socket, (event) => {
        if (!authenticated) {
          if (event.type !== 'auth' || event.token !== token) {
            socket.destroy();
            return;
          }
          authenticated = true;
          return;
        }
        hostEvents.push(event);
        if (event.type === 'ready') {
          clearTimeout(timeout);
          ready();
        }
      });
    });
    await new Promise((resolve) => hostServer.listen(hostEnvironment.BLITZ_HOST_CHANNEL, resolve));
  }
  const files = new Map([['/fixture.swf', path.join(config.out, 'fixture.swf')]]);
  for (const name of config.assets) {
    if (!/^(UI_[A-Za-z0-9_]+|Levels[A-Za-z0-9]+|GlobalMap01)\.swf$/.test(name))
      throw Error('Unexpected fixture asset');
    files.set('/assets/' + name, path.join(config.root, '.test-tools/wide-live-assets', name));
  }
  const server = http.createServer((request, response) => {
    const file = files.get(request.url);
    if (request.method !== 'GET' || !file) {
      response.writeHead(404);
      return response.end();
    }
    response.setHeader('Content-Type', 'application/x-shockwave-flash');
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const prefs = path.join(config.out, 'config');
  fs.mkdirSync(prefs);
  fs.writeFileSync(path.join(prefs, 'preferences.toml'), 'enable_openh264 = false\n');
  const args = [
    '--no-gui',
    '--graphics',
    'dx12',
    '--width',
    '1600',
    '--height',
    '900',
    '--volume',
    '0',
    '--storage',
    config.storage === 'disk' ? 'disk' : 'memory',
    '--dummy-external-interface',
    '--config',
    prefs,
    '--cache-directory',
    path.join(config.out, 'cache'),
    '--save-directory',
    config.saveDirectory || path.join(config.out, 'saves'),
    '--tcp-connections',
    'deny',
    '--open-url-mode',
    'deny',
    '--filesystem-access-mode',
    'deny',
    config.movieURL || 'http://127.0.0.1:' + server.address().port + '/fixture.swf',
  ];
  if (config.sourceURL) args.unshift('--spoof-url', config.sourceURL);
  if (Number.isInteger(config.frameRate) && config.frameRate >= 1 && config.frameRate <= 1000)
    args.unshift('--frame-rate', String(config.frameRate));
  const child = spawn(config.runtime, args, {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...hostEnvironment,
      BLITZ_FIXTURE_CONTROL: '1',
      ...(config.capture ? { BLITZ_FPS_PROOF_DIR: config.out } : {}),
      RUST_LOG: config.logLevel || 'warn,avm_trace=info',
    },
  });
  child.stdin.on('error', () => {});
  let sequence = 0;
  const requests = new Map(),
    lines = [],
    waiters = [];
  const rpc = (name, args = []) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        requests.delete(id);
        reject(Error('RPC timeout: ' + name));
      }, 6000);
      requests.set(id, (value) => {
        clearTimeout(timeout);
        value.ok ? resolve(value.value) : reject(Error('Rejected RPC: ' + name));
      });
      child.stdin.write(JSON.stringify({ id, name, args }) + '\n');
    });
  const until = (pattern) =>
    new Promise((resolve, reject) => {
      if (lines.some((line) => line.includes(pattern))) return resolve();
      const timeout = setTimeout(() => reject(Error('Missing fixture marker: ' + pattern)), 25000);
      waiters.push({
        pattern,
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
    });
  for (const pipe of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    pipe.on('data', (data) => {
      fs.appendFileSync(log, data);
      pending += decoder.write(data);
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (lines.length < 4096) lines.push(line);
        const match = line.match(/^BLITZ_RPC (\{.*\})/);
        if (match) {
          const value = JSON.parse(match[1]),
            receive = requests.get(value.id);
          requests.delete(value.id);
          receive?.(value);
        }
        for (let index = waiters.length - 1; index >= 0; index--)
          if (line.includes(waiters[index].pattern)) waiters.splice(index, 1)[0].resolve();
      }
    });
  }
  const exited = new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  const deadline = setTimeout(() => child.kill(), runtimeBudgetMs);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let result;
  try {
    await hostReady;
    result = await suite({
      rpc,
      until,
      delay,
      config,
      host: {
        events: hostEvents,
        send: (command) => hostSocket.write(JSON.stringify(command) + '\n'),
      },
    });
    child.stdin.write(JSON.stringify({ id: ++sequence, name: 'CloseFixture', args: [] }) + '\n');
  } catch (error) {
    fs.writeFileSync(path.join(config.out, 'failure.log'), error.stack);
    child.stdin.end();
    throw error;
  } finally {
    const code = await exited;
    clearTimeout(deadline);
    server.close();
    hostSocket?.destroy();
    hostServer?.close();
    fs.writeFileSync(
      path.join(config.out, 'result.json'),
      JSON.stringify({ code, result, noAccounts: true, noOSInput: true }, null, 2)
    );
    if (code !== 0) throw Error('Fixture exit: ' + code);
  }
  console.log(config.out);
  return result;
}

module.exports = { privateRun, privateRunAsync, run };
