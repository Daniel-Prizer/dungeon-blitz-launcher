// Rendering-worker clock only. Fine waits yield between MessageChannel tasks;
// they never block the game thread or change a system timer/priority setting.
// This deliberately spends render-worker CPU at high caps. Idle scenes sleep
// until the next snapshot rather than polling this clock without drawing.
export class CooperativeClock {
  constructor() {
    this.closed = false;
    this.pending = null;
    this.sequence = 0;
    this.mode = 'cooperative-worker-deadline';
    this.channel = new MessageChannel();
    this.channel.port1.onmessage = ({ data }) => {
      if (this.pending?.id === data) this.check();
    };
  }
  wait(delay) {
    if (this.closed || this.pending || !Number.isFinite(delay) || delay < 0 || delay > 1000)
      return Promise.reject(Error('Invalid cooperative deadline'));
    if (delay === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.pending = { id: ++this.sequence, deadline: performance.now() + delay, resolve, reject };
      this.check();
    });
  }
  check() {
    const p = this.pending;
    if (!p || this.closed) return;
    const remaining = p.deadline - performance.now();
    if (remaining <= 0) {
      this.pending = null;
      p.resolve();
    } else if (remaining > 5)
      this.timer = setTimeout(
        () => {
          this.timer = null;
          if (this.pending?.id === p.id) this.check();
        },
        Math.max(1, Math.floor(remaining - 3))
      );
    else this.channel.port2.postMessage(p.id);
  }
  close(error = Error('Cooperative clock closed')) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.channel.port1.close();
    this.channel.port2.close();
    if (this.pending) {
      this.pending.reject(error);
      this.pending = null;
    }
  }
}
