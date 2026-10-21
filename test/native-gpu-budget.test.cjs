const { test } = require('node:test'),
  assert = require('node:assert/strict');
async function exercise({ captureMs, readMs = 0 }) {
  const { GpuSession } = await import('../src/gpu/session.mjs'),
    prior = { document: global.document, Worker: global.Worker, fetch: global.fetch };
  let session,
    request = 0,
    frames = 0,
    hidden = false,
    removed = 0;
  const geometry = {
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
  const element = {
    querySelector: () => ({ value: 'transparent' }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    BlitzGpuStructure: () => ({ games: [{ play: true }] }),
    BlitzGpuNativeView: (value) => {
      hidden = value;
      return { ...geometry, hidden };
    },
    BlitzGpuSetBinary: () => true,
    BlitzGpuRelease: () => true,
    BlitzGpuRequestFrame: () => ++request,
    BlitzGpuFrameResult: () => {
      const until = performance.now() + readMs;
      while (performance.now() < until) {}
      return { request, supported: true, width: 100, height: 100, captureMs };
    },
  };
  const container = { style: { background: 'old', position: 'old', zIndex: 'old' } };
  global.document = {
    hidden: false,
    getElementById: () => element,
    querySelector: () => container,
    createElement: () => ({
      style: {},
      transferControlToOffscreen: () => ({}),
      remove() {
        removed++;
      },
    }),
    body: { appendChild() {} },
  };
  global.fetch = async () => ({ ok: true, text: async () => '' });
  global.Worker = class {
    postMessage(message) {
      setTimeout(() => {
        if (message.action === 'frame' && ++frames === 20) session.running = false;
        this.onmessage?.({
          data: { channel: 'blitz-gpu-render-v1', id: message.id, result: { known: [] } },
        });
      }, 0);
    }
    terminate() {}
  };
  try {
    session = new GpuSession({ nativeFlash: true, verified: () => true });
    session.binaryVerified.add(element);
    session.running = true;
    let error;
    try {
      await session.world();
    } catch (value) {
      error = value;
    }
    assert(!hidden);
    assert.equal(removed, 1);
    assert(!session.quarantined);
    assert.deepEqual(container.style, { background: 'old', position: 'old', zIndex: 'old' });
    return { error, frames };
  } finally {
    Object.assign(global, prior);
  }
}
test('sustained expensive native exports restore the original view and request bounded backoff', async () => {
  const { error, frames } = await exercise({ captureMs: 30 });
  assert(error?.nativeUiBudget);
  assert.match(error.message, /native UI budget/);
  assert(frames <= 15);
});
test('normal Flash round-trip waits do not trip the native CPU capture budget', async () => {
  const { error, frames } = await exercise({ captureMs: 1, readMs: 18 });
  assert.equal(error, undefined);
  assert.equal(frames, 20);
});
