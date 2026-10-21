export class DeadlineClock {
  constructor() {
    this.worker = new Worker(new URL('./deadline-worker.mjs', import.meta.url), { type: 'module' });
    this.id = 0;
    this.pending = null;
    this.closed = false;
    this.mode = null;
    this.worker.onmessage = ({ data }) => {
      if (!this.pending || data.id !== this.pending.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      this.mode = data.clock;
      pending.resolve();
    };
    this.worker.onerror = () => this.close(Error('Presentation clock worker failed'));
  }
  wait(delayMs) {
    if (this.closed || this.pending || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 1000)
      return Promise.reject(Error('Invalid or concurrent presentation wait'));
    if (delayMs === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => this.close(Error('Presentation clock timeout')), 3000);
      this.pending = { id, resolve, reject, timer };
      this.worker.postMessage({
        id,
        deadline: performance.timeOrigin + performance.now() + delayMs,
      });
    });
  }
  close(reason = Error('Presentation clock closed')) {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(reason);
      this.pending = null;
    }
  }
}
