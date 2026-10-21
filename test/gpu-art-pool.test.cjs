const { test } = require('node:test'),
  assert = require('node:assert/strict');
const png = (w, h) => {
  const b = new ArrayBuffer(33),
    v = new DataView(b);
  v.setUint32(0, 0x89504e47);
  v.setUint32(4, 0x0d0a1a0a);
  v.setUint32(8, 13);
  v.setUint32(12, 0x49484452);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};
test('decoded artwork budget tracks live leases and is reclaimed across long streams', async () => {
  const before = global.Worker;
  let closed = 0;
  global.Worker = class {
    postMessage(job) {
      const v = new DataView(job.bytes),
        bitmap = {
          width: v.getUint32(16),
          height: v.getUint32(20),
          close() {
            closed++;
          },
        };
      setImmediate(() => this.onmessage({ data: { id: job.id, bitmap } }));
    }
    terminate() {}
  };
  const { ArtworkPool } = await import('../src/gpu/art-pool.mjs'),
    pool = new ArtworkPool(2);
  try {
    const a = await pool.decode(png(4096, 4096)),
      b = await pool.decode(png(4096, 4096));
    await assert.rejects(pool.decode(png(1, 1)), /budget/);
    assert.equal(pool.release(a), true);
    assert.equal(pool.release(a), false);
    const c = await pool.decode(png(4096, 4096));
    pool.release(b);
    pool.release(c);
    assert.equal(pool.reservedPixels, 0);
    for (let i = 0; i < 150; i++) {
      const bitmap = await pool.decode(png(512, 512));
      pool.release(bitmap);
    }
    assert.equal(pool.leases.size, 0);
    assert.equal(pool.reservedPixels, 0);
    assert.equal(closed, 153);
  } finally {
    pool.close();
    global.Worker = before;
  }
});
test('artwork dimension mismatches release reservations and close untrusted output', async () => {
  const before = global.Worker;
  let closed = 0;
  global.Worker = class {
    postMessage(job) {
      setImmediate(() =>
        this.onmessage({
          data: {
            id: job.id,
            bitmap: {
              width: 99,
              height: 99,
              close() {
                closed++;
              },
            },
          },
        })
      );
    }
    terminate() {}
  };
  const { ArtworkPool } = await import('../src/gpu/art-pool.mjs'),
    pool = new ArtworkPool(1);
  try {
    await assert.rejects(pool.decode(png(2, 2)), /dimensions/);
    assert.equal(pool.reservedPixels, 0);
    assert.equal(closed, 1);
  } finally {
    pool.close();
    global.Worker = before;
  }
});
