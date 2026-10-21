// Collect only the explicitly observed public static asset paths, without
// cookies, tokens or an authenticated browser. No installed/game files change.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-tools/gpu-live'),
  assets = path.join(out, 'assets'),
  lib = path.join(root, '.test-tools/focus/ffdec/lib/*');
require('../research/gpu/background.cjs').lowerSelf();
(async () => {
  const all = process.argv.includes('--all');
  let paths;
  if (all) {
    const response = await fetch(
      'https://dungeonblitzr.theminesa.studio/p/cbp/masterFileList.xml',
      { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) }
    );
    if (!response.ok) throw Error('Public asset manifest HTTP ' + response.status);
    const xml = await response.text();
    if (xml.length > 65536 || /<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error('Unsupported public manifest');
    fs.writeFileSync(path.join(out, 'masterFileList.xml'), xml);
    paths = [...xml.matchAll(/<(?:File|Level)\s+([^>]+)\/>/g)]
      .map((m) =>
        Object.fromEntries([...m[1].matchAll(/([A-Za-z]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))
      )
      .filter((a) => a.Name?.endsWith('.swf'))
      .map((a) => {
        if (!/^[a-z0-9]{3}$/.test(a.Version) || !/^(?:sounds\/)?[A-Za-z0-9_]+\.swf$/.test(a.Name))
          throw Error('Invalid public manifest entry');
        return '/p/' + a.Version + '/' + a.Name;
      });
  } else paths = JSON.parse(fs.readFileSync(path.join(out, 'public-asset-paths.json'), 'utf8'));
  if (!Array.isArray(paths) || paths.length > 128) throw Error('Unbounded public asset list');
  fs.mkdirSync(assets, { recursive: true });
  if (all) {
    const observed = JSON.parse(fs.readFileSync(path.join(out, 'public-asset-paths.json'), 'utf8'));
    paths = [...new Set([...paths, ...observed])];
    if (paths.length > 128) throw Error('Unbounded combined public asset list');
  }
  execFileSync(
    'javac',
    ['-cp', lib, '-d', out, path.join(root, 'research/gpu/BitmapWriteInventory.java')],
    { stdio: 'inherit', windowsHide: true, timeout: 60000 }
  );
  const records = [];
  let total = 0;
  for (const name of paths) {
    if (!/^\/p\/[a-z0-9]{3}\/(?:sounds\/)?[A-Za-z0-9_]+\.swf$/.test(name))
      throw Error('Disallowed public asset path');
    if (name.endsWith('/DungeonBlitz.swf')) continue;
    const url = 'https://dungeonblitzr.theminesa.studio' + name + '?fv=cbp',
      response = await fetch(url, {
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    if (!response.ok) throw Error('Public asset HTTP ' + response.status);
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 32 * 1024 * 1024) throw Error('Static asset exceeds research budget');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (!['FWS', 'CWS'].includes(bytes.toString('ascii', 0, 3))) throw Error('Not a public SWF');
    total += bytes.length;
    if (total > 160 * 1024 * 1024) throw Error('Public corpus exceeds research budget');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex'),
      file = sha256 + '.swf';
    fs.writeFileSync(path.join(assets, file), bytes);
    const inventory = execFileSync(
      'java',
      [
        '-Djava.awt.headless=true',
        '-cp',
        out + path.delimiter + lib,
        'BitmapWriteInventory',
        path.join(assets, file),
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 }
    );
    fs.writeFileSync(path.join(assets, sha256 + '.inventory.txt'), inventory);
    const match = /TOTAL (\d+)/.exec(inventory);
    if (!match) throw Error('Asset inventory did not complete');
    records.push({
      url,
      sha256,
      bytes: bytes.length,
      file,
      possibleBitmapOrGraphicsWrites: Number(match[1]),
    });
  }
  const result = {
    checkedAt: new Date().toISOString(),
    scope: all
      ? 'All SWFs listed by the freshly fetched public masterFileList.xml; inventory only, not a visual/gameplay approval'
      : 'Unauthenticated static assets observed in the independent tutorial browser; not a complete all-dungeons asset contract',
    assets: records,
  };
  fs.writeFileSync(
    path.join(out, all ? 'asset-manifest-all.json' : 'asset-manifest.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        assets: records.length,
        totalBytes: records.reduce((n, r) => n + r.bytes, 0),
        possibleWrites: records
          .filter((r) => r.possibleBitmapOrGraphicsWrites)
          .map((r) => ({ url: r.url, count: r.possibleBitmapOrGraphicsWrites })),
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e.stack || e);
  process.exitCode = 1;
});
