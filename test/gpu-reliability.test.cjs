'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  zlib = require('node:zlib'),
  crypto = require('node:crypto'),
  { EventEmitter } = require('node:events');
const { adaptGpuClient } = require('../src/gpu/client-adapter.cjs');
test('Equivalent compressed sources retain every reviewed byte; code or header changes reject', () => {
  const source = fs.readFileSync(
      require('path').join(__dirname, '../.test-tools/gpu-current-oct21/current.swf')
    ),
    recipe = require('../src/gpu/adapter.json'),
    body = zlib.inflateSync(source.subarray(8)),
    repacked = Buffer.concat([source.subarray(0, 8), zlib.deflateSync(body, { level: 0 })]);
  assert.notEqual(
    crypto.createHash('sha256').update(source).digest('hex'),
    crypto.createHash('sha256').update(repacked).digest('hex')
  );
  assert.deepEqual(adaptGpuClient(repacked, recipe), adaptGpuClient(source, recipe));
  const modified = Buffer.from(body);
  modified[modified.length - 1] ^= 1;
  assert.equal(
    adaptGpuClient(Buffer.concat([source.subarray(0, 8), zlib.deflateSync(modified)]), recipe),
    null
  );
  const header = Buffer.from(repacked);
  header[3] ^= 1;
  assert.equal(adaptGpuClient(header, recipe), null);
});
test('Original fallback uses the Flash root on the selected official origin and retains language', () => {
  const { originalAddress } = require('../src/game-source.cjs');
  for (const origin of [
    'https://dungeonblitzr.theminesa.studio',
    'https://dungeonblitz.theminesa.studio',
  ]) {
    assert.equal(originalAddress(origin + '/web/?lang=en#ignored'), origin + '/?lang=en');
    assert.equal(originalAddress(origin + '/'), origin + '/');
  }
  for (const url of [
    'http://localhost:8000/',
    'https://example.com/',
    'https://user:pass@dungeonblitz.theminesa.studio/',
  ])
    assert.equal(originalAddress(url), null);
});
test('Unsupported GPU source falls back to the configured Original host without changing preferences', async () => {
  const filename = require.resolve('../src/legacy-runtime.cjs'),
    prior = require.cache[filename],
    fetchOriginal = global.fetch,
    created = [];
  class Surface extends EventEmitter {
    constructor(...args) {
      super();
      created.push(args);
      this.closed = false;
      setImmediate(() => this.emit('ready'));
    }
    close() {
      this.closed = true;
    }
    configure() {}
    resize() {}
  }
  require.cache[filename] = { exports: { LegacyRuntime: Surface } };
  delete require.cache[require.resolve('../src/modern-runtime.cjs')];
  try {
    global.fetch = async (url) => ({
      ok: true,
      headers: { get: () => null },
      text: async () => '',
      body: (async function* () {
        yield Buffer.from(
          String(url).includes('DungeonBlitz.swf')
            ? 'unreviewed'
            : '<object data="/p/cbp/DungeonBlitz.swf?clientrev=unknown"></object>'
        );
      })(),
    });
    const { ModernRuntime } = require('../src/modern-runtime.cjs'),
      address = 'https://dungeonblitzr.theminesa.studio/?lang=en',
      runtime = new ModernRuntime('fixture-runtime', Buffer.alloc(8), true, true, address, false);
    let ready = 0;
    runtime.on('ready', () => ready++);
    runtime.on('failure', (message) => assert.fail(message));
    try {
      for (let i = 0; i < 100 && !ready; i++) await new Promise((r) => setTimeout(r, 5));
      assert.equal(ready, 1);
      assert.equal(created.length, 1);
      assert.equal(created[0][4], address);
      assert.equal(created[0][5], false);
      assert.equal(created[0][6], undefined, 'Fallback uses Original, with no GPU config');
      assert.match(runtime.gpuStatus.reason, /client changed/);
      runtime.close();
      assert(runtime.inner.closed);
    } finally {
      runtime.close();
      runtime.cleanup();
    }
  } finally {
    global.fetch = fetchOriginal;
    require.cache[filename] = prior;
    delete require.cache[require.resolve('../src/modern-runtime.cjs')];
  }
});
test('GPU worker startup, loss and cancellation restore native pixels and dispose owned resources', async () => {
  const { GpuSession } = await import('../src/gpu/session.mjs'),
    prior = { document: global.document, Worker: global.Worker, fetch: global.fetch };
  let hidden = false,
    removed = 0,
    terminated = 0,
    created = 0,
    mode = 'constructor';
  const container = { style: { background: 'old', position: 'old', zIndex: 'old' } },
    geometry = {
      supported: true,
      bitmapWidth: 100,
      bitmapHeight: 100,
      width: 100,
      height: 100,
      stageWidth: 100,
      stageHeight: 100,
      x: 0,
      y: 0,
    };
  const native = {
    callExternalInterface(name, value) {
      if (name === 'BlitzGpuStructure') return { games: [{ play: true }] };
      if (name === 'BlitzGpuNativeView') {
        hidden = value;
        return { ...geometry, hidden };
      }
      if (name === 'BlitzGpuRequestFrame') return 1;
      if (name === 'BlitzGpuFrameResult')
        return { request: 1, supported: true, width: 100, height: 100, captureMs: 0 };
      return true;
    },
  };
  const element = {
    loadedConfig: { wmode: 'transparent' },
    ruffle: () => native,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
  global.document = {
    hidden: false,
    querySelector: (s) => (s === 'ruffle-player' ? element : container),
    createElement: () => ({
      style: {},
      transferControlToOffscreen: () => ({}),
      remove() {
        removed++;
      },
    }),
    body: {
      appendChild() {
        created++;
      },
    },
  };
  global.fetch = async () => ({ ok: true, text: async () => '' });
  global.Worker = class {
    constructor() {
      if (mode === 'constructor') throw Error('worker unavailable');
    }
    postMessage(m) {
      if (m.action === 'frame') return;
      setTimeout(() => {
        if (m.action === 'init')
          this.onmessage?.({ data: { channel: 'blitz-gpu-render-v1', event: 'ready' } });
        this.onmessage?.({ data: { channel: 'blitz-gpu-render-v1', id: m.id, result: {} } });
      }, 0);
    }
    terminate() {
      terminated++;
    }
  };
  try {
    let s = new GpuSession({ verified: () => true });
    s.binaryVerified.add(element);
    await assert.rejects(s.world(), /worker unavailable/);
    assert(!hidden);
    assert.equal(removed, 1);
    assert.deepEqual(container.style, { background: 'old', position: 'old', zIndex: 'old' });
    mode = 'silent';
    s = new GpuSession({ verified: () => true });
    s.binaryVerified.add(element);
    s.running = true;
    let begin = performance.now();
    await assert.rejects(s.world(), /stopped responding/);
    assert(performance.now() - begin < 1400);
    assert(!hidden);
    assert.equal(terminated, 1);
    s = new GpuSession({ verified: () => true });
    s.binaryVerified.add(element);
    s.running = true;
    const pending = s.world();
    while (!hidden) await new Promise((r) => setTimeout(r, 1));
    begin = performance.now();
    s.current.cancel();
    await assert.rejects(pending, /cancelled/);
    assert(performance.now() - begin < 700);
    assert(!hidden);
    assert.equal(terminated, 2);
    assert.equal(removed, created);
  } finally {
    Object.assign(global, prior);
  }
});
test('A failed GPU startup closes only its own new host; an established game is never restarted', async () => {
  const filename = require.resolve('../src/legacy-runtime.cjs'),
    prior = require.cache[filename],
    fetchOriginal = global.fetch,
    created = [];
  let failStartup = true;
  class Surface extends EventEmitter {
    constructor(...args) {
      super();
      this.options = args[6];
      this.child = { pid: 9000 + created.length };
      this.host = { pid: 10000 + created.length };
      created.push(this);
      setImmediate(() =>
        this.emit(
          this.options?.modern && failStartup ? 'failure' : 'ready',
          'fixture startup failure'
        )
      );
    }
    close() {
      this.closed = true;
    }
    configure() {}
    resize() {}
  }
  require.cache[filename] = { exports: { LegacyRuntime: Surface } };
  delete require.cache[require.resolve('../src/modern-runtime.cjs')];
  const source = fs.readFileSync(
    require('path').join(__dirname, '../.test-tools/gpu-current-oct21/current.swf')
  );
  global.fetch = async (url) => ({
    ok: true,
    headers: { get: () => null },
    body: (async function* () {
      yield String(url).includes('DungeonBlitz.swf')
        ? source
        : Buffer.from('<object data="/p/cbp/DungeonBlitz.swf?clientrev=reviewed"></object>');
    })(),
  });
  const runtimes = [];
  try {
    const { ModernRuntime } = require('../src/modern-runtime.cjs');
    let ready = 0;
    const one = new ModernRuntime(
      'fixture',
      Buffer.alloc(8),
      true,
      true,
      'https://dungeonblitzr.theminesa.studio/'
    );
    runtimes.push(one);
    one.on('ready', () => ready++);
    one.on('failure', (message) => assert.fail(message));
    for (let i = 0; i < 200 && !ready; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(ready, 1);
    assert.equal(created.length, 2);
    assert(created[0].closed);
    assert(!created[1].options?.modern);
    one.close();
    failStartup = false;
    ready = 0;
    const two = new ModernRuntime(
      'fixture',
      Buffer.alloc(8),
      true,
      true,
      'https://dungeonblitzr.theminesa.studio/'
    );
    runtimes.push(two);
    two.on('ready', () => ready++);
    let error = '';
    two.on('failure', (value) => (error = value));
    for (let i = 0; i < 200 && !ready; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(ready, 1);
    assert.equal(two.child, created.at(-1).child, 'The updater receives the owned GPU process');
    assert.equal(two.host, created.at(-1).host, 'The updater also waits for native attachment');
    created.at(-1).emit('failure', 'fixture later fault');
    assert.equal(error, 'fixture later fault');
    assert.equal(created.length, 3);
    assert(!created.at(-1).closed);
    two.close();
  } finally {
    for (const r of runtimes) {
      r.close();
      r.cleanup();
    }
    global.fetch = fetchOriginal;
    require.cache[filename] = prior;
    delete require.cache[require.resolve('../src/modern-runtime.cjs')];
  }
});
