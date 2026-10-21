// Experimental render data only. No game clock, entity or network mutations.
// The resident GPU pose cache has a separate, bounded budget from each native
// frame/decode transaction. Native game bitmap allocation limits are unchanged.
export const LIMITS = Object.freeze({
  nodes: 16384,
  textures: 2048,
  dimension: 8192,
  atlasBytes: 256 * 1024 * 1024,
  nativeFrameBytes: 128 * 1024 * 1024,
  snapshots: 3,
});
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const array = (x, n, min, max) =>
  Array.isArray(x) && x.length === n && x.every((v) => finite(v, min, max));
export function validateSnapshot(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.artworkRevision) ||
    value.artworkRevision < 1 ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    !finite(value.time, 0, Number.MAX_SAFE_INTEGER) ||
    typeof value.epoch !== 'string' ||
    value.epoch.length < 1 ||
    value.epoch.length > 128 ||
    !Array.isArray(value.nodes) ||
    value.nodes.length > LIMITS.nodes
  )
    throw Error('Invalid scene envelope');
  const ids = new Set();
  const nodes = value.nodes.map((n) => {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !n.id ||
      n.id.length > 128 ||
      ids.has(n.id) ||
      !Number.isSafeInteger(n.texture) ||
      n.texture < 0 ||
      n.texture >= LIMITS.textures ||
      !array(n.matrix, 6, -1e7, 1e7) ||
      !array(n.size, 2, 0, LIMITS.dimension) ||
      !array(n.tint, 4, -16, 16) ||
      !array(n.offset ?? [0, 0, 0, 0], 4, -16, 16) ||
      !array(n.clip, 4, -1e7, 1e7) ||
      n.clip[2] < n.clip[0] ||
      n.clip[3] < n.clip[1] ||
      !['normal', 'add'].includes(n.blend) ||
      typeof n.interpolate !== 'boolean'
    )
      throw Error('Unsupported or invalid scene node');
    // The adapter must flatten unsupported semantics explicitly or retain native
    // rendering. Silently dropping a mask/filter would corrupt real game artwork.
    if (
      Object.keys(n).some(
        (k) =>
          ![
            'id',
            'texture',
            'matrix',
            'size',
            'tint',
            'offset',
            'clip',
            'blend',
            'interpolate',
            'sampling',
            'motion',
          ].includes(k)
      ) ||
      !['linear', 'nearest'].includes(n.sampling ?? 'linear')
    )
      throw Error('Unsupported scene semantics');
    if (
      n.motion &&
      (typeof n.motion.id !== 'string' ||
        !n.motion.id ||
        n.motion.id.length > 128 ||
        Object.keys(n.motion).some((k) => !['id', 'parent'].includes(k)) ||
        !array(n.motion.parent, 6, -1e7, 1e7))
    )
      throw Error('Invalid native motion anchor');
    ids.add(n.id);
    return Object.freeze({
      ...n,
      ...(n.motion
        ? {
            motion: Object.freeze({ id: n.motion.id, parent: Object.freeze([...n.motion.parent]) }),
          }
        : {}),
      sampling: n.sampling ?? 'linear',
      matrix: Object.freeze([...n.matrix]),
      size: Object.freeze([...n.size]),
      tint: Object.freeze([...n.tint]),
      offset: Object.freeze([...(n.offset ?? [0, 0, 0, 0])]),
      clip: Object.freeze([...n.clip]),
    });
  });
  return Object.freeze({
    version: 1,
    artworkRevision: value.artworkRevision,
    epoch: value.epoch,
    sequence: value.sequence,
    time: value.time,
    nodes: Object.freeze(nodes),
  });
}
export class SceneTimeline {
  constructor({ delayMs = 0, maxAgeMs = 1000 } = {}) {
    if (!finite(delayMs, 0, 250) || !finite(maxAgeMs, 1, 5000))
      throw Error('Invalid timeline settings');
    this.delayMs = delayMs;
    this.maxAgeMs = maxAgeMs;
    this.snapshots = [];
  }
  push(input) {
    const snapshot = validateSnapshot(input),
      last = this.snapshots[this.snapshots.length - 1];
    if (last && (snapshot.sequence <= last.sequence || snapshot.time <= last.time))
      throw Error('Out-of-order scene');
    if (
      last &&
      (last.epoch !== snapshot.epoch || last.artworkRevision !== snapshot.artworkRevision)
    )
      this.snapshots = [];
    this.snapshots.push(snapshot);
    if (this.snapshots.length > LIMITS.snapshots) this.snapshots.shift();
    return snapshot;
  }
  sample(now) {
    if (!finite(now, 0, Number.MAX_SAFE_INTEGER)) throw Error('Invalid presentation time');
    const last = this.snapshots[this.snapshots.length - 1];
    if (!last || now < last.time || now - last.time > this.maxAgeMs) return null;
    const target = now - this.delayMs;
    let b = this.snapshots.find((s) => s.time >= target) || last,
      a = this.snapshots[Math.max(0, this.snapshots.indexOf(b) - 1)];
    if (target <= this.snapshots[0].time) return this.snapshots[0];
    if (a === b || target >= b.time) return b;
    const alpha = Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))),
      next = new Map(b.nodes.map((n) => [n.id, n]));
    // Keep old membership/order/pose until the newer snapshot's timestamp. Only
    // explicitly continuous transforms interpolate; never interpolate a teleport,
    // changed pose, atlas revision, effects lifetime or authoritative state.
    return {
      ...a,
      time: target,
      nodes: a.nodes.map((n) => {
        const m = next.get(n.id);
        if (!n.interpolate || !m?.interpolate || m.blend !== n.blend || m.sampling !== n.sampling)
          return n;
        // Native sprite poses remain discrete, but their parent's continuous world
        // translation is independent of a changed pose/cache crop. Move the OLD pose
        // with that anchor; never mix its pixels, dimensions or pose-local offset.
        if (m.texture === n.texture && n.size.every((v, i) => v === m.size[i])) {
          if (Math.hypot(m.matrix[4] - n.matrix[4], m.matrix[5] - n.matrix[5]) > 128) return n;
          return { ...n, matrix: n.matrix.map((v, i) => v + (m.matrix[i] - v) * alpha) };
        }
        if (
          n.motion &&
          m.motion?.id === n.motion.id &&
          n.motion.parent.slice(0, 4).every((v, i) => v === m.motion.parent[i])
        ) {
          const dx = m.motion.parent[4] - n.motion.parent[4],
            dy = m.motion.parent[5] - n.motion.parent[5];
          if (Math.hypot(dx, dy) <= 128)
            return {
              ...n,
              matrix: [...n.matrix.slice(0, 4), n.matrix[4] + dx * alpha, n.matrix[5] + dy * alpha],
            };
        }
        return n;
      }),
    };
  }
  reset() {
    this.snapshots = [];
  }
  nextChange(now) {
    const target = now - this.delayMs;
    let next = Infinity;
    for (let i = 1; i < this.snapshots.length; i++) {
      const a = this.snapshots[i - 1],
        b = this.snapshots[i];
      if (b.time <= target) continue;
      const after = new Map(b.nodes.map((n) => [n.id, n]));
      if (a.nodes.length !== b.nodes.length) next = Math.min(next, b.time + this.delayMs);
      for (const n of a.nodes) {
        const m = after.get(n.id);
        if (!m) {
          next = Math.min(next, b.time + this.delayMs);
          continue;
        }
        const samePose = n.texture === m.texture && n.size.every((v, j) => v === m.size[j]),
          move = samePose
            ? n.matrix.some((v, j) => v !== m.matrix[j])
            : n.motion &&
              m.motion?.id === n.motion.id &&
              n.motion.parent.slice(0, 4).every((v, j) => v === m.motion.parent[j]) &&
              (n.motion.parent[4] !== m.motion.parent[4] ||
                n.motion.parent[5] !== m.motion.parent[5]);
        if (n.interpolate && m.interpolate && move)
          next = Math.min(next, Math.max(now, a.time + this.delayMs));
        else if (
          !samePose ||
          n.tint.some((v, j) => v !== m.tint[j]) ||
          n.offset.some((v, j) => v !== m.offset[j]) ||
          n.clip.some((v, j) => v !== m.clip[j]) ||
          n.matrix.some((v, j) => v !== m.matrix[j]) ||
          n.blend !== m.blend ||
          n.sampling !== m.sampling
        )
          next = Math.min(next, b.time + this.delayMs);
      }
    }
    return Number.isFinite(next) ? next : null;
  }
  retainedIndices() {
    return new Set(this.snapshots.flatMap((s) => s.nodes.map((n) => n.texture)));
  }
  rebaseArtwork(previousRevision, artworkRevision, changedIndices = []) {
    if (!Number.isSafeInteger(artworkRevision) || artworkRevision <= previousRevision)
      throw Error('Invalid texture revision');
    const retained = this.retainedIndices();
    if (
      changedIndices.some((i) => retained.has(i)) ||
      this.snapshots.some((s) => s.artworkRevision !== previousRevision)
    )
      throw Error('Texture update would change a retained scene');
    this.snapshots = this.snapshots.map((s) => Object.freeze({ ...s, artworkRevision }));
  }
}
export class FramePacer {
  constructor(cap = 240) {
    this.setCap(cap);
    this.deadline = null;
  }
  setCap(cap) {
    if (!Number.isInteger(cap) || cap < 15 || cap > 1000) throw Error('FPS cap must be 15–1000');
    this.cap = cap;
    this.period = 1000 / cap;
    this.deadline = null;
  }
  advance(now) {
    if (!finite(now, 0, Number.MAX_SAFE_INTEGER)) throw Error('Invalid clock');
    this.deadline = Math.max(now, this.deadline ?? now) + this.period;
    return this.deadline - now;
  }
  reset() {
    this.deadline = null;
  }
}
