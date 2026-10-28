'use strict';
// Fresh anonymous deployment and adapter check; never opens a game account.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  runtimeRoot = path.resolve(process.argv[2] || root),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const recipes = [
  'adaptive-contract-effects-oct28',
  'adaptive-contract-backdrop-oct19',
  'adaptive-contract',
  'adaptive-contract-oct15',
  'adaptive-contract-oct16',
  'adaptive-contract-oct17',
  'adaptive-contract-recovery-oct17',
  'adaptive-contract-map-oct19',
].map((n) =>
  JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'runtime/game/resources', n + '.json')))
);
async function bytes(url, limit) {
  return require('../src/game-source.cjs').publicBytes(url, limit);
}
(async () => {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const rows = [];
  for (const origin of [
    'https://dungeonblitzr.theminesa.studio/',
    'https://dungeonblitz.theminesa.studio/',
  ]) {
    const html = (await bytes(origin, 1024 * 1024)).toString(),
      match = html.match(
        /(?:https:\/\/(?:dungeonblitzr|dungeonblitz)\.theminesa\.studio)?\/p\/[a-z]{3}\/DungeonBlitz\.swf\?[^\s"'<>`$]+/
      );
    assert(match, 'Referenced public SWF required');
    const url = new URL(match[0].replaceAll('&amp;', '&'), origin).href,
      source = await bytes(url, 4 * 1024 * 1024),
      sha256 = hash(source);
    const original = require('../src/legacy/client-adapter.cjs').adaptClient(source, origin, {
      multiplayer: recipes,
    });
    assert.equal(original.mode, 'contract');
    assert(original.audio && original.patched);
    const gpu = require('../src/gpu/client-adapter.cjs').adaptGpuClient(
      source,
      require('../src/gpu/adapter.json')
    );
    fs.writeFileSync(path.join(root, 'artifacts', 'multiplayer-' + sha256 + '.swf'), source);
    rows.push({
      origin,
      url,
      sha256,
      bytes: source.length,
      original: 'guarded contract',
      gpu: gpu ? 'exact reviewed contract' : 'native fallback; requires review',
    });
  }
  const record = { checkedAt: new Date().toISOString(), rows };
  fs.writeFileSync(
    path.join(root, 'artifacts/multiplayer-check-oct21.json'),
    JSON.stringify(record, null, 2)
  );
  console.log(JSON.stringify(record, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
