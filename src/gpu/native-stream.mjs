import { NativeTextureLedger } from './native-packet.mjs';
import { ArtworkPool } from './art-pool.mjs';
// One collector transaction at a time. Old poses remain immutable until their
// last retained snapshot and GPU fence have expired. No game state is written.
export class NativeSceneStream {
  constructor(player, { assetContractVerified = false, workers = 2, workerSource = null } = {}) {
    if (!assetContractVerified) throw Error('Unverified native artwork writers');
    this.player = player;
    this.ledger = new NativeTextureLedger();
    this.pool = new ArtworkPool(workers, workerSource);
    this.busy = false;
    this.closed = false;
    this.stats = { packets: 0, uploads: 0, uploadMs: 0, decodeMs: 0, gpuUploadMs: 0 };
  }
  get known() {
    return this.ledger.known;
  }
  async publish(packet, time) {
    if (this.closed || this.busy) throw Error('Native scene stream closed or busy');
    if (
      packet.width !== this.player.renderer.width ||
      packet.height !== this.player.renderer.height
    )
      throw Error('Native scene dimensions changed');
    this.busy = true;
    let plan,
      decoded = [];
    try {
      plan = this.ledger.prepare(packet, {
        retainedIndices: this.player.timeline.retainedIndices(),
        assetContractVerified: true,
      });
      const changed = [...plan.append, ...plan.reuse],
        start = performance.now();
      const results = await Promise.allSettled(
        changed.map((e) =>
          e.art.encoding === 'utf16-uri-v1'
            ? this.pool.decodeNative(e.art)
            : this.pool.decode(Uint8Array.from(atob(e.art.png), (c) => c.charCodeAt(0)).buffer)
        )
      );
      decoded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failure = results.find((r) => r.status === 'rejected');
      if (failure) throw failure.reason;
      this.stats.decodeMs += performance.now() - start;
      const uploadStart = performance.now();
      if (this.closed) throw Error('Native scene stream closed during decoding');
      const bitmaps = new Map(changed.map((e, i) => [e.index, decoded[i]]));
      await this.player.withResources(async () => {
        const renderer = this.player.renderer;
        const rebase = (receipt) =>
          this.player.timeline.rebaseArtwork(
            receipt.previousRevision,
            receipt.artworkRevision,
            receipt.changedIndices || []
          );
        if (plan.reset) {
          this.player.timeline.reset();
          if (plan.append.length)
            await renderer.setArtwork(plan.append.map((e) => bitmaps.get(e.index)));
          else throw Error('Empty native scene artwork');
        } else {
          if (plan.reuse.length)
            rebase(
              await renderer.reuseArtwork(
                plan.reuse.map((e) => ({ index: e.index, bitmap: bitmaps.get(e.index) })),
                renderer.artworkRevision
              )
            );
          if (plan.append.length)
            rebase(
              await renderer.appendArtwork(
                plan.append.map((e) => bitmaps.get(e.index)),
                renderer.artworkRevision
              )
            );
        }
        this.player.clear = plan.packet.clear;
        this.player.publish({
          version: 1,
          epoch: plan.packet.epoch,
          sequence: plan.packet.sequence,
          time,
          artworkRevision: renderer.artworkRevision,
          nodes: plan.nodes,
        });
        this.ledger.commit(plan);
      });
      this.stats.packets++;
      this.stats.uploads += decoded.length;
      this.stats.uploadMs += performance.now() - start;
      this.stats.gpuUploadMs += performance.now() - uploadStart;
      return { known: this.known, time };
    } catch (error) {
      if (plan) this.ledger.cancel(plan);
      throw error;
    } finally {
      decoded.forEach((b) => this.pool.release(b));
      this.busy = false;
    }
  }
  close() {
    this.closed = true;
    this.pool.close();
  }
}
