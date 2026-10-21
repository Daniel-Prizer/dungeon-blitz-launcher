import { LIMITS } from './scene.mjs';
export class ArtworkPool {
  constructor(size = Math.min(4, navigator.hardwareConcurrency || 1), workerSource = null) {
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 4 ||
      (workerSource !== null && (typeof workerSource !== 'string' || workerSource.length > 32768))
    )
      throw Error('Invalid worker count or source');
    this.workerUrl =
      workerSource === null
        ? null
        : URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    this.closed = false;
    this.queue = [];
    this.next = 0;
    this.reservedPixels = 0;
    this.leases = new Map();
    this.workers = Array.from({ length: size }, () => {
      const worker = new Worker(this.workerUrl || new URL('./art-worker.mjs', import.meta.url), {
          type: 'module',
        }),
        slot = { worker, job: null };
      worker.onmessage = ({ data }) => {
        const job = slot.job;
        if (!job || data.id !== job.id) {
          data.bitmap?.close();
          return;
        }
        slot.job = null;
        clearTimeout(job.timer);
        if (
          data.error ||
          !data.bitmap ||
          data.bitmap.width !== job.width ||
          data.bitmap.height !== job.height
        ) {
          data.bitmap?.close();
          this.reservedPixels -= job.pixels;
          job.reject(Error(data.error || 'Decoded artwork dimensions changed'));
        } else {
          this.leases.set(data.bitmap, job.pixels);
          job.resolve(data.bitmap);
        }
        this.drain();
      };
      worker.onerror = (event) => {
        this.close(
          Error(
            'Artwork worker failed: ' +
              String(event.message || 'module loading error').slice(0, 300)
          )
        );
      };
      return slot;
    });
  }
  decode(bytes) {
    if (this.closed) return Promise.reject(Error('Artwork pool closed'));
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength < 33 ||
      bytes.byteLength > 32 * 1024 * 1024 ||
      this.queue.length + this.workers.filter((w) => w.job).length >= LIMITS.textures
    )
      return Promise.reject(Error('Artwork decode budget exceeded'));
    // Native exports are PNG. Check declared size before asking a browser decoder
    // to allocate pixels; bound queued, decoding and leased bitmaps together.
    const view = new DataView(bytes),
      width = view.getUint32(16),
      height = view.getUint32(20);
    if (
      view.getUint32(0) !== 0x89504e47 ||
      view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452 ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 16 * 1024 * 1024 ||
      (this.reservedPixels + width * height) * 4 > LIMITS.nativeFrameBytes
    )
      return Promise.reject(Error('PNG dimensions exceed decode budget'));
    return this.enqueue({ bytes }, width, height);
  }
  decodeNative(art) {
    if (
      !art ||
      art.encoding !== 'utf16-uri-v1' ||
      typeof art.binary !== 'string' ||
      !Number.isInteger(art.byteLength) ||
      art.byteLength < 33 ||
      art.byteLength > 8 * 1024 * 1024 ||
      art.binary.length > (art.byteLength + 1) * 3
    )
      return Promise.reject(Error('Invalid native PNG transport'));
    return this.enqueue(
      { encoded: { encoding: art.encoding, binary: art.binary, byteLength: art.byteLength } },
      art.width,
      art.height
    );
  }
  enqueue(payload, width, height) {
    if (
      this.closed ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 16 * 1024 * 1024 ||
      (this.reservedPixels + width * height) * 4 > LIMITS.nativeFrameBytes ||
      this.queue.length + this.workers.filter((w) => w.job).length >= LIMITS.textures
    )
      return Promise.reject(Error('Artwork decode budget exceeded'));
    this.reservedPixels += width * height;
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: ++this.next,
        payload,
        width,
        height,
        pixels: width * height,
        resolve,
        reject,
      });
      this.drain();
    });
  }
  release(bitmap) {
    const pixels = this.leases.get(bitmap);
    if (pixels === undefined) return false;
    this.leases.delete(bitmap);
    this.reservedPixels -= pixels;
    bitmap.close();
    return true;
  }
  drain() {
    for (const slot of this.workers) {
      if (slot.job || !this.queue.length) continue;
      const job = (slot.job = this.queue.shift());
      job.timer = setTimeout(() => this.close(Error('Artwork decode timed out')), 15000);
      slot.worker.postMessage(
        { id: job.id, ...job.payload, width: job.width, height: job.height },
        job.payload.bytes ? [job.payload.bytes] : []
      );
    }
  }
  close(error = Error('Artwork pool closed')) {
    if (this.closed) return;
    this.closed = true;
    for (const slot of this.workers) {
      slot.worker.terminate();
      if (slot.job) {
        clearTimeout(slot.job.timer);
        slot.job.reject(error);
        slot.job = null;
      }
    }
    for (const job of this.queue) job.reject(error);
    this.queue = [];
    for (const bitmap of this.leases.keys()) bitmap.close();
    this.leases.clear();
    this.reservedPixels = 0;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
  }
}
