'use strict';
const { EventEmitter } = require('node:events'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { LegacyRuntime } = require('./legacy-runtime.cjs');
const { adaptGpuClient } = require('./gpu/client-adapter.cjs');
const recipe = require('./gpu/adapter.json');
const recipes = [recipe, require('./gpu/adapter-20261020.json')];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const { modernAddress, originalAddress, publicBytes } = require('./game-source.cjs');
class ModernRuntime extends EventEmitter {
  constructor(root, parent, test, privateDesktop, address, acceleration = true) {
    super();
    this.root = root;
    this.closed = false;
    this.pending = [];
    this.abort = new AbortController();
    this.scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blitz-gpu-'));
    this.launch = { parent, test, privateDesktop, address, acceleration };
    void this.initialize(parent, test, privateDesktop, address, acceleration).catch((error) => {
      if (!this.closed) {
        if (modernAddress(address))
          this.original('GPU startup unavailable; using Original. Your GPU preference is kept.');
        else this.emit('failure', error.message);
      }
      if (!this.inner) this.cleanup();
    });
  }
  original(reason) {
    if (this.closed || this.fallback) return;
    this.fallback = true;
    if (this.inner) this.inner.close();
    else this.cleanup();
    this.gpuStatus = { phase: 'native', reason, completedFrames: 0, completedCanvasFPS: 0 };
    const { parent, test, privateDesktop, address, acceleration } = this.launch;
    try {
      this.attach(
        new LegacyRuntime(
          this.root,
          parent,
          test,
          privateDesktop,
          originalAddress(address),
          acceleration
        ),
        false
      );
      this.emit('status');
    } catch (error) {
      this.emit('failure', error.message);
    }
  }
  attach(child, modern) {
    this.inner = child;
    let ready = false;
    for (const name of ['ready', 'failure', 'status', 'event', 'cursor-setting', 'key'])
      child.on(name, (...args) => {
        if (this.closed || this.inner !== child) return;
        if (name === 'ready') ready = true;
        if (name === 'failure' && modern && !ready) {
          this.original('GPU startup unavailable; using Original. Your GPU preference is kept.');
          return;
        }
        if (name === 'event' && args[0]?.type === 'gpu-status') this.gpuStatus = args[0].status;
        this.emit(name, ...args);
      });
    for (const [method, args] of this.pending) child[method](...args);
    this.pending = [];
  }
  async initialize(parent, test, privateDesktop, address, acceleration) {
    const url = modernAddress(address);
    if (!url)
      throw Error(
        'GPU rendering currently supports the official multiplayer game. Choose Original for a local server.'
      );
    const html = (await publicBytes(url, 1024 * 1024, this.abort.signal)).toString('utf8'),
      match = html.match(
        /(?:https:\/\/(?:dungeonblitzr|dungeonblitz)\.theminesa\.studio)?\/p\/[a-z]{3}\/DungeonBlitz\.swf\?[^\s"'<>`$]+/
      );
    if (!match)
      throw Error(
        'Official game client address changed. Choose Original while compatibility is reviewed.'
      );
    const source = await publicBytes(
      new URL(match[0].replaceAll('&amp;', '&'), url).href,
      4 * 1024 * 1024,
      this.abort.signal
    );
    let patched;
    for (const selected of recipes) {
      patched = adaptGpuClient(source, selected);
      if (patched) break;
    }
    if (!patched) {
      this.original(
        'The game client changed; using Original with its guarded enhancements. Your GPU preference is kept.'
      );
      return;
    }
    const file = path.join(this.scratch, 'client.swf');
    fs.writeFileSync(file, patched, { flag: 'wx' });
    const config = path.join(this.scratch, 'host.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        url,
        resources: path.join(this.root, 'modern/resources'),
        profile: path.join(
          process.env.APPDATA,
          test ? 'BlitzBrowser-Gpu-Test' : 'BlitzBrowser-Gpu'
        ),
        sourceHash: hash(source),
        patched: file,
        patchedHash: hash(patched),
        engineHash: '5822ddb03354ef0bf3ecaac38d52516ec2a616124be1f10f38ca5d2a9d64508f',
      }),
      { flag: 'wx' }
    );
    if (this.closed) {
      this.cleanup();
      return;
    }
    this.attach(
      new LegacyRuntime(this.root, parent, test, privateDesktop, url, acceleration, {
        modern: true,
        config,
        onExit: () => this.cleanup(),
      }),
      true
    );
  }
  dispatch(method, args) {
    if (this.closed) return;
    if (this.inner) this.inner[method](...args);
    else if (this.pending.length < 100) this.pending.push([method, args]);
  }
  configure(...args) {
    this.dispatch('configure', args);
  }
  resize(...args) {
    this.dispatch('resize', args);
  }
  focus() {
    this.dispatch('focus', []);
  }
  send(...args) {
    this.dispatch('send', args);
  }
  testHost(...args) {
    this.dispatch('testHost', args);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    this.inner?.close();
    if (!this.inner) this.cleanup();
    else setTimeout(() => this.cleanup(), 4000).unref();
  }
  cleanup() {
    // Only this class's newly created temporary directory is removable.
    if (
      this.scratch &&
      path.dirname(this.scratch) === os.tmpdir() &&
      path.basename(this.scratch).startsWith('blitz-gpu-')
    )
      try {
        fs.rmSync(this.scratch, { recursive: true, force: true });
      } catch {}
  }
}
for (const key of [
  'clientIntegration',
  'audioIntegration',
  'cursorState',
  'audioState',
  'originalPointer',
  'child',
  'host',
])
  Object.defineProperty(ModernRuntime.prototype, key, {
    get() {
      return this.inner?.[key];
    },
    set(value) {
      if (this.inner) this.inner[key] = value;
    },
  });
module.exports = { ModernRuntime, modernAddress, originalAddress, publicBytes };
