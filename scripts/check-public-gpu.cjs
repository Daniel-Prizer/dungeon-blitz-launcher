'use strict';
// Public static deployment only. Never uses a browser/profile, cookies or auth.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { publicBytes } = require('../src/game-source.cjs'),
  { adaptGpuClient } = require('../src/gpu/client-adapter.cjs');
const root = path.resolve(__dirname, '..'),
  recipe = require('../src/gpu/adapter.json'),
  assets = require('../src/gpu/assets.json'),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
  const result = { startedAt: new Date().toISOString(), origins: [] };
  for (const origin of [
    'https://dungeonblitzr.theminesa.studio',
    'https://dungeonblitz.theminesa.studio',
  ]) {
    const page = await publicBytes(origin + '/', 1024 * 1024),
      match = page.toString('utf8').match(/\/p\/[a-z0-9]{3}\/DungeonBlitz\.swf\?[^\s"'`$<>]+/);
    if (!match) throw Error('Public game URL needs review');
    const url = new URL(match[0].replaceAll('&amp;', '&'), origin);
    if (url.origin !== origin) throw Error('Unexpected public game origin');
    const client = await publicBytes(url.href, 4 * 1024 * 1024);
    if (!adaptGpuClient(client, recipe)) throw Error('Public main client needs code review');
    const identity = {
      origin,
      url: url.href,
      sourceHash: hash(client),
      bytes: client.length,
      pageHash: hash(page),
      assets: [],
    };
    let bytes = 0,
      next = 0;
    const jobs = await Promise.allSettled(
      Array.from({ length: 4 }, async () => {
        while (next < assets.assets.length) {
          const selected = assets.assets[next++];
          if (!/^\/p\/[a-z0-9]{3}\/(?:sounds\/)?[A-Za-z0-9_]+\.swf$/.test(selected.path))
            throw Error('Invalid reviewed asset path');
          const data = await publicBytes(origin + selected.path + '?fv=cbp', 32 * 1024 * 1024);
          bytes += data.length;
          if (bytes > 160 * 1024 * 1024) throw Error('Public corpus budget exceeded');
          const digest = hash(data);
          if (data.length !== selected.bytes || digest !== selected.sha256)
            throw Error('Public artwork needs review: ' + selected.name);
          identity.assets.push({ name: selected.name, sha256: digest, bytes: data.length });
        }
      })
    );
    for (const job of jobs) if (job.status === 'rejected') throw job.reason;
    identity.assets.sort((a, b) => a.name.localeCompare(b.name));
    identity.assetBytes = bytes;
    result.origins.push(identity);
  }
  result.completedAt = new Date().toISOString();
  result.compatible = true;
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'artifacts/public-native-gpu-check.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(
    JSON.stringify({
      compatible: true,
      origins: result.origins.map((o) => ({
        origin: o.origin,
        sourceHash: o.sourceHash,
        assets: o.assets.length,
        assetBytes: o.assetBytes,
      })),
      completedAt: result.completedAt,
    })
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
