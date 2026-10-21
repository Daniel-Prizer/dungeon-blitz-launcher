import { LIMITS, validateSnapshot } from './scene.mjs';
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
const id = (s) => typeof s === 'string' && /^b[1-9][0-9]{0,9}$/.test(s);
const key = (a) => a.id + ':' + a.revision;
export function inspectNativePacket(packet, { assetContractVerified = false } = {}) {
  if (!assetContractVerified) throw Error('Native artwork-writer asset contract is unverified');
  if (
    !packet ||
    packet.protocol !== 1 ||
    packet.supported !== true ||
    packet.worldOnly !== true ||
    packet.requiresAssetContract !== true ||
    typeof packet.epoch !== 'string' ||
    !packet.epoch ||
    packet.epoch.length > 128 ||
    !uint(packet.sequence) ||
    !Number.isInteger(packet.width) ||
    !Number.isInteger(packet.height) ||
    packet.width < 1 ||
    packet.height < 1 ||
    packet.width > 4096 ||
    packet.height > 4096 ||
    !Array.isArray(packet.activeArt) ||
    packet.activeArt.length > LIMITS.textures ||
    !Array.isArray(packet.art) ||
    packet.art.length > LIMITS.textures ||
    !Array.isArray(packet.nodes) ||
    packet.nodes.length > LIMITS.nodes ||
    !Array.isArray(packet.clear) ||
    packet.clear.length !== 4 ||
    packet.clear.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
  )
    throw Error('Unsupported native scene envelope');
  let pixels = 0,
    encoded = 0;
  const active = new Map(),
    art = new Map();
  for (const a of packet.activeArt) {
    if (
      !a ||
      !id(a.id) ||
      !uint(a.revision) ||
      !Number.isInteger(a.width) ||
      !Number.isInteger(a.height) ||
      a.width < 1 ||
      a.height < 1 ||
      a.width > 8190 ||
      a.height > 8190 ||
      a.width * a.height > 16777216 ||
      active.has(a.id)
    )
      throw Error('Invalid native artwork identity');
    pixels += a.width * a.height;
    if (pixels * 4 > LIMITS.nativeFrameBytes) throw Error('Native artwork budget exceeded');
    active.set(
      a.id,
      Object.freeze({ id: a.id, revision: a.revision, width: a.width, height: a.height })
    );
  }
  for (const a of packet.art) {
    const expected = active.get(a?.id),
      binary = a?.encoding === 'utf16-uri-v1';
    if (
      !expected ||
      a.revision !== expected.revision ||
      a.width !== expected.width ||
      a.height !== expected.height ||
      art.has(a.id)
    )
      throw Error('Invalid native artwork transfer');
    if (binary) {
      if (
        typeof a.binary !== 'string' ||
        !Number.isInteger(a.byteLength) ||
        a.byteLength < 33 ||
        a.byteLength > 8388608 ||
        a.binary.length > (a.byteLength + 1) * 3
      )
        throw Error('Invalid native artwork transfer');
      encoded += a.byteLength;
    } else {
      if (
        typeof a.png !== 'string' ||
        a.png.length < 44 ||
        a.png.length > 11184812 ||
        a.png.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(a.png)
      )
        throw Error('Invalid native artwork transfer');
      encoded += (a.png.length * 3) / 4;
    }
    if (encoded > 33554432) throw Error('Native artwork transfer budget exceeded');
    art.set(a.id, a);
  }
  const nodes = packet.nodes.map((n) => {
    if (!n || !active.has(n.textureId)) throw Error('Native draw references missing artwork');
    const { textureId, ...visual } = n;
    const checked = validateSnapshot({
      version: 1,
      artworkRevision: 1,
      epoch: packet.epoch,
      sequence: packet.sequence,
      time: 0,
      nodes: [{ ...visual, texture: 0 }],
    }).nodes[0];
    if (
      checked.size[0] !== active.get(textureId).width ||
      checked.size[1] !== active.get(textureId).height
    )
      throw Error('Native draw dimensions disagree');
    return { ...checked, textureId };
  });
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
    throw Error('Native draw identity is duplicated');
  return {
    epoch: packet.epoch,
    sequence: packet.sequence,
    width: packet.width,
    height: packet.height,
    clear: [...packet.clear],
    active,
    art,
    nodes,
  };
}
// Transactional identity/lifetime planner. Each native revision gets an
// immutable texture while retained scenes reference it. Recycle only slots
// that the controller has excluded from all snapshots and drained GPU work.
export class NativeTextureLedger {
  constructor() {
    this.entries = new Map();
    this.slots = [];
    this.epoch = null;
    this.sequence = -1;
    this.revision = 0;
    this.pending = null;
    this.known = [];
  }
  prepare(packet, { retainedIndices = new Set(), assetContractVerified = false } = {}) {
    if (this.pending) throw Error('A native texture transaction is already pending');
    const p = inspectNativePacket(packet, { assetContractVerified });
    if (p.sequence <= this.sequence) throw Error('Out-of-order native scene');
    const reset = p.epoch !== this.epoch,
      entries = reset ? new Map() : new Map(this.entries),
      slots = reset ? [] : this.slots.map((s) => ({ ...s })),
      keep = reset ? new Set() : new Set(retainedIndices),
      activeKeys = new Set([...p.active.values()].map(key));
    // Keep inactive poses resident until their slot is actually needed. Only
    // active or retained snapshots pin a slot; idle cache entries can be evicted.
    for (const [k, e] of entries)
      if (p.active.has(e.id) && !activeKeys.has(k) && !keep.has(e.index)) entries.delete(k);
    const pinned = new Set(
        [...entries]
          .filter(([k, e]) => activeKeys.has(k) || keep.has(e.index))
          .map(([, e]) => e.index)
      ),
      append = [],
      reuse = [];
    for (const a of p.active.values()) {
      const k = key(a),
        existing = entries.get(k);
      if (existing) {
        if (existing.width !== a.width || existing.height !== a.height)
          throw Error('Immutable native artwork dimensions changed');
        entries.set(k, { ...existing, lastSeen: p.sequence });
        continue;
      }
      const art = p.art.get(a.id);
      if (!art) throw Error('Native artwork was acknowledged before upload');
      const occupied = new Set([...entries.values()].map((e) => e.index)),
        bytes = slots.reduce((sum, s) => sum + (s.width + 2) * (s.height + 2) * 4, 0),
        addedBytes = (a.width + 2) * (a.height + 2) * 4,
        canGrow = bytes + addedBytes <= LIMITS.atlasBytes * 0.75 && slots.length < LIMITS.textures;
      let index = -1,
        best = Infinity;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (
          !occupied.has(i) &&
          !pinned.has(i) &&
          s.width >= a.width &&
          s.height >= a.height &&
          s.width * s.height < best
        ) {
          index = i;
          best = s.width * s.height;
        }
      }
      if (index < 0 && !canGrow) {
        let oldest = Infinity;
        for (const e of entries.values()) {
          const s = slots[e.index];
          if (
            !pinned.has(e.index) &&
            s.width >= a.width &&
            s.height >= a.height &&
            e.lastSeen < oldest
          ) {
            index = e.index;
            oldest = e.lastSeen;
          }
        }
      }
      const entry = { ...a, art, index };
      if (index < 0) {
        if (slots.length >= LIMITS.textures || bytes + addedBytes > LIMITS.atlasBytes)
          throw Error('Retained native texture count or bytes exceed budget');
        index = slots.length;
        entry.index = index;
        slots.push({ width: a.width, height: a.height });
        append.push(entry);
      } else {
        for (const [old, e] of entries) if (e.index === index) entries.delete(old);
        reuse.push(entry);
      }
      pinned.add(index);
      entries.set(k, { ...a, index, lastSeen: p.sequence });
    }
    const nodes = p.nodes.map(({ textureId, ...n }) => ({
      ...n,
      texture: entries.get(key(p.active.get(textureId))).index,
    }));
    const known = new Map();
    for (const e of entries.values()) {
      const prev = known.get(e.id);
      if (!prev || prev.revision < e.revision) known.set(e.id, { id: e.id, revision: e.revision });
    }
    const plan = {
      base: this.revision,
      packet: p,
      reset,
      entries,
      slots,
      append,
      reuse,
      nodes,
      known: [...known.values()],
    };
    this.pending = plan;
    return plan;
  }
  commit(plan) {
    if (this.pending !== plan || plan.base !== this.revision)
      throw Error('Invalid native texture commit');
    this.entries = plan.entries;
    this.slots = plan.slots;
    this.known = plan.known;
    this.epoch = plan.packet.epoch;
    this.sequence = plan.packet.sequence;
    this.pending = null;
    this.revision++;
  }
  cancel(plan) {
    if (this.pending === plan) this.pending = null;
  }
}
