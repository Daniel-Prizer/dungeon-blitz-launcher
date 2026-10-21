'use strict';
// Applied only AFTER the ordinary local presentation contract succeeds. This
// pins the original Connection initializer and changes only owned endpoints.
const crypto = require('crypto');
const { readSWF, writeSWF, encodeTag, encodePools, integer } = require('./swf-contract.cjs');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const connectionHash = '437150a2fa8a7b14393d9195414a0df677d5a1734537550a67e1240057a8f745';
const endpoints = new Map([
  [
    'http://localhost:80/p/cbv/DungeonBlitz.swf?fv=cbq&gv=cbv',
    (p) => `http://localhost:${p}/p/cbv/DungeonBlitz.swf?fv=cbq&gv=cbv`,
  ],
  [':8000/p/', (p) => `:${p}/p/`],
  [
    'http://localhost:8000/p/cbp/DungeonBlitz.swf?fv=cbz&gv=cbx',
    (p) => `http://localhost:${p}/p/cbp/DungeonBlitz.swf?fv=cbz&gv=cbx`,
  ],
]);
function ports(value) {
  return (
    value &&
    Object.keys(value).length === 2 &&
    ['http', 'game'].every(
      (k) => Number.isInteger(value[k]) && value[k] >= 1024 && value[k] <= 65535
    ) &&
    value.http !== value.game
  );
}
function localizeClient(input, address, value) {
  if (!ports(value)) return null;
  try {
    const u = new URL(address);
    if (
      u.protocol !== 'http:' ||
      u.hostname !== 'localhost' ||
      Number(u.port) !== value.http ||
      u.username ||
      u.password
    )
      return null;
    const swf = readSWF(input),
      candidates = swf.tags.filter(
        (t) => t.abc && t.abc.bodies.some((b) => b.name === 'Connection.cinit')
      );
    if (candidates.length !== 1) return null;
    const tag = candidates[0],
      abc = tag.abc,
      body = abc.bodies.find((b) => b.name === 'Connection.cinit');
    if (
      digest(body.code) !== connectionHash ||
      !body.code.subarray(497, 500).equals(Buffer.from([0x25, 0x90, 0x3f]))
    )
      return null;
    const pools = Object.fromEntries(Object.entries(abc.pools).map(([k, v]) => [k, v.slice()]));
    let changed = 0;
    pools.strings = pools.strings.map((v) => {
      if (v === null) return v;
      const text = Buffer.from(v, 'base64').toString(),
        replace = endpoints.get(text);
      if (!replace) return v;
      changed++;
      return Buffer.from(replace(value.http)).toString('base64');
    });
    if (changed !== 3 || pools.ints.length < 128 || pools.ints.length >= 16384) return null;
    // pushint has the same encoded width as the pinned pushshort, and supports
    // ephemeral ports above 32767 without signed-short ambiguity.
    const operand = Buffer.concat([Buffer.from([0x2d]), integer(pools.ints.length)]);
    if (operand.length !== 3) return null;
    pools.ints.push(value.game);
    const bytes = Buffer.from(body.bytes);
    operand.copy(bytes, body.codeOffset + 497);
    const prefix = Buffer.concat([
      abc.prefix.subarray(0, 4),
      encodePools(pools),
      abc.prefix.subarray(abc.poolEnd),
    ]);
    const replacement = encodeTag(
      tag.type,
      Buffer.concat([tag.lead, prefix, ...abc.bodies.map((b) => (b === body ? bytes : b.bytes))])
    );
    return writeSWF(
      swf,
      swf.tags.map((t) => (t === tag ? replacement : t.raw))
    );
  } catch {
    return null;
  }
}
module.exports = { localizeClient, ports };
