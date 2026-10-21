import { FramePacer, SceneTimeline } from './scene.mjs';

// Render ownership only: no game update, action, packet, audio or animation
// callbacks. The native view remains available until a supported snapshot has
// rendered; onFault must restore it on unsupported or stale states.
export class ScenePlayer {
  constructor(
    renderer,
    {
      cap = 240,
      delayMs = 16,
      mode = 'display',
      clock = null,
      onFault = () => {},
      onReady = () => {},
      onSceneReady = () => {},
      onNative = () => {},
    } = {}
  ) {
    if (!['display', 'unlocked'].includes(mode) || (mode === 'unlocked' && !clock))
      throw Error('Unlocked rendering requires the trusted host deadline clock');
    this.renderer = renderer;
    this.pacer = new FramePacer(cap);
    this.timeline = new SceneTimeline({ delayMs, maxAgeMs: 250 });
    this.mode = mode;
    this.clock = clock;
    this.onFault = onFault;
    this.onReady = onReady;
    this.onSceneReady = onSceneReady;
    this.onNative = onNative;
    this.lastPresentedSequence = -1;
    this.running = false;
    this.pending = [];
    this.loop = null;
    this.request = null;
    this.token = 0;
    this.hasPresented = false;
    this.resourceBarrier = null;
    this.clear = [0, 0, 0, 0];
    this.stats = { completedFrames: 0, submittedPresents: 0, staleScenes: 0 };
    this.visibility = () => this.pacer.reset();
    globalThis.document?.addEventListener('visibilitychange', this.visibility);
  }
  publish(scene) {
    const snapshot = this.timeline.push(scene);
    this.wakeScene?.();
    return snapshot;
  }
  setCap(cap) {
    this.pacer.setCap(cap);
  }
  start(canvas) {
    if (this.running) return;
    if (this.loop) throw Error('Wait for the prior render loop to stop');
    if (!this.timeline.snapshots.length)
      throw Error('A supported scene is required before GPU activation');
    this.renderer.attachCanvas(canvas);
    this.running = true;
    this.hasPresented = false;
    const token = ++this.token;
    this.loop = (this.mode === 'display' ? this.displayLoop(token) : this.unlockedLoop(token))
      .catch(async (error) => {
        this.running = false;
        await this.drain();
        await this.onNative(error);
        await this.onFault(error);
      })
      .finally(() => {
        this.loop = null;
      });
  }
  async rendered(task) {
    const result = await task;
    if (result.skipped) return result;
    this.stats.completedFrames++;
    this.stats.submittedPresents++;
    if (!this.hasPresented && this.running) {
      this.hasPresented = true;
      await this.onReady(result);
    }
    if (this.running && result.sequence > this.lastPresentedSequence) {
      this.lastPresentedSequence = result.sequence;
      await this.onSceneReady(result);
    }
    return result;
  }
  async drain() {
    const tasks = this.pending.splice(0);
    return Promise.allSettled(tasks);
  }
  async waitForScene(delay = 50) {
    await new Promise((resolve) => {
      let timer;
      this.wakeScene = () => {
        clearTimeout(timer);
        this.wakeScene = null;
        resolve();
      };
      timer = setTimeout(this.wakeScene, Math.max(1, Math.min(50, delay)));
    });
  }
  async withResources(update) {
    if (this.resourceBarrier) throw Error('Concurrent resource update');
    let release;
    this.resourceBarrier = new Promise((r) => (release = r));
    try {
      await this.drain();
      return await update();
    } finally {
      this.resourceBarrier = null;
      release();
    }
  }
  sceneAt(now) {
    const scene = this.timeline.sample(now);
    if (!scene) {
      this.stats.staleScenes++;
      throw Error('Native scene stream is stale; restore the native view');
    }
    return scene;
  }
  async displayLoop(token) {
    while (this.running && this.token === token) {
      await new Promise((resolve) => {
        this.wake = resolve;
        this.request = requestAnimationFrame(resolve);
      });
      this.wake = null;
      this.request = null;
      const now = performance.now();
      if (!this.running || this.token !== token) break;
      if (this.resourceBarrier) {
        await this.resourceBarrier;
        continue;
      }
      if (globalThis.document?.hidden) {
        this.pacer.reset();
        continue;
      }
      if (this.pacer.deadline !== null && now < this.pacer.deadline) continue;
      this.pacer.advance(now);
      const task = this.rendered(
        this.renderer.submit(this.sceneAt(now), { clear: this.clear, skipUnchanged: true })
      );
      this.pending.push(task);
      try {
        await task;
      } finally {
        this.pending.shift();
      }
    }
  }
  async unlockedLoop(token) {
    while (this.running && this.token === token) {
      if (this.resourceBarrier) {
        await this.resourceBarrier;
        continue;
      }
      if (globalThis.document?.hidden) {
        this.pacer.reset();
        await this.clock.wait(100);
        continue;
      }
      // Await the oldest fence before adding another frame. Bounded pipelining
      // removes the CPU/GPU round trip without accumulating a latency backlog.
      if (this.pending.length >= Math.min(2, this.renderer.maxFramesInFlight)) {
        const oldest = this.pending[0];
        await oldest;
        const index = this.pending.indexOf(oldest);
        if (index >= 0) this.pending.splice(index, 1);
      }
      if (this.resourceBarrier) continue;
      const now = performance.now();
      if (this.pacer.deadline !== null && now < this.pacer.deadline) {
        await this.clock.wait(this.pacer.deadline - now);
        continue;
      }
      this.pacer.advance(now);
      const submission = this.renderer.submit(this.sceneAt(now), {
          clear: this.clear,
          skipUnchanged: true,
        }),
        task = this.rendered(submission);
      task.catch(() => {});
      this.pending.push(task);
      // A stationary native scene has no intermediate transform to render. Wait
      // for new source data instead of consuming a core to redraw equal state.
      if (submission.skipped) {
        const next = this.timeline.nextChange(performance.now()),
          delay = next === null ? 50 : next - performance.now();
        if (next === null || delay > 5) await this.waitForScene(next === null ? 50 : delay - 3);
        else if (delay > 0) await this.clock.wait(delay);
      }
    }
    const results = await this.drain();
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
  async stop() {
    this.running = false;
    this.token++;
    this.wakeScene?.();
    if (this.request !== null) {
      cancelAnimationFrame(this.request);
      this.request = null;
      this.wake?.(performance.now());
      this.wake = null;
    }
    if (this.loop) await this.loop;
    await this.drain();
    await this.onNative(null);
    this.renderer.detachCanvas();
    this.pacer.reset();
  }
  async close() {
    await this.stop();
    this.clock?.close();
    globalThis.document?.removeEventListener('visibilitychange', this.visibility);
    this.timeline.reset();
  }
}
