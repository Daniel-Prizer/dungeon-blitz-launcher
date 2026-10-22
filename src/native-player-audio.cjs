'use strict';
const names = require('./native-player-audio.json');
if (
  names.length > 256 ||
  names.some((name) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.mp3$/.test(name)) ||
  new Set(names).size !== names.length
)
  throw Error('Invalid public audio inventory');
const paths = names.map((name) => '/p/mp3/' + name);

function frame(bytes, at) {
  if (at + 4 > bytes.length || bytes[at] !== 255 || (bytes[at + 1] & 224) !== 224) return null;
  const version = (bytes[at + 1] >> 3) & 3,
    layer = (bytes[at + 1] >> 1) & 3;
  const rateIndex = (bytes[at + 2] >> 2) & 3,
    bitrateIndex = bytes[at + 2] >> 4;
  if (version === 1 || layer !== 1 || rateIndex === 3 || bitrateIndex === 0 || bitrateIndex === 15)
    return null;
  const bitrate = (
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  )[bitrateIndex];
  const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  return {
    version,
    rate,
    length:
      Math.floor(((version === 3 ? 144000 : 72000) * bitrate) / rate) + ((bytes[at + 2] >> 1) & 1),
  };
}
function isMp3(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > 8 * 1024 * 1024) return false;
  let at = 0;
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    if (
      bytes.length < 10 ||
      bytes[3] < 2 ||
      bytes[3] > 4 ||
      bytes.subarray(6, 10).some((n) => n > 127)
    )
      return false;
    at = 10 + bytes[6] * 2097152 + bytes[7] * 16384 + bytes[8] * 128 + bytes[9];
    if (bytes[3] === 4 && bytes[5] & 16) at += 10;
  }
  // Some encoders put a small padding gap after ID3.
  for (let n = 0; n < 1024 && bytes[at] === 0; n++) at++;
  const first = frame(bytes, at);
  if (!first) return false;
  const next = at + first.length,
    second = frame(bytes, next);
  return (
    !!second &&
    first.version === second.version &&
    first.rate === second.rate &&
    next + second.length <= bytes.length
  );
}
function createAudioCache(fetchBytes) {
  const allowed = new Set(paths),
    cache = new Map(),
    pending = new Map(),
    waiters = [];
  let bytesUsed = 0,
    active = 0,
    closed = false;
  async function load(pathname) {
    if (closed || !allowed.has(pathname)) throw Error('Public audio path rejected');
    const hit = cache.get(pathname);
    if (hit) {
      cache.delete(pathname);
      cache.set(pathname, hit);
      return hit;
    }
    if (pending.has(pathname)) return pending.get(pathname);
    const request = (async () => {
      if (active >= 2) await new Promise((resolve) => waiters.push(resolve));
      else active++;
      try {
        if (closed) throw Error('Audio cache closed');
        const bytes = await fetchBytes(pathname);
        if (closed || !isMp3(bytes)) throw Error('Invalid public MP3');
        while (cache.size >= 64 || bytesUsed + bytes.length > 32 * 1024 * 1024) {
          const oldest = cache.keys().next().value;
          bytesUsed -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        cache.set(pathname, bytes);
        bytesUsed += bytes.length;
        return bytes;
      } finally {
        const next = waiters.shift();
        if (next) next();
        else active--;
      }
    })();
    pending.set(pathname, request);
    try {
      return await request;
    } finally {
      pending.delete(pathname);
    }
  }
  return {
    load,
    close() {
      closed = true;
      cache.clear();
      bytesUsed = 0;
    },
  };
}
module.exports = { paths, isMp3, createAudioCache };
