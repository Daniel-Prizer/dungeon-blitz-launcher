// Trusted-host timing transport. A plain webpage gets no Node/native access;
// the isolated probe injects only this bounded wait operation, never an API to
// load libraries, execute code, access files, input or game state.
export class HostDeadlineClock {
  constructor(wait) {
    if (typeof wait !== 'function') throw Error('Trusted deadline transport unavailable');
    this.transport = wait;
    this.pending = false;
    this.closed = false;
    this.mode = 'windows-private-high-resolution';
  }
  async wait(delay) {
    if (this.closed || this.pending) throw Error('Deadline clock closed or busy');
    if (!Number.isFinite(delay) || delay < 0 || delay > 1000) throw Error('Invalid deadline delay');
    if (delay === 0) return;
    this.pending = true;
    try {
      const elapsed = await this.transport(delay);
      if (!Number.isFinite(elapsed) || elapsed < 0)
        throw Error('Invalid host deadline acknowledgement');
      if (this.closed) throw Error('Deadline clock closed');
      return elapsed;
    } finally {
      this.pending = false;
    }
  }
  close() {
    this.closed = true;
  }
}
