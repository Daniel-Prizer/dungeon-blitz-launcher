'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  review = require('../src/legacy/client-singleplayer.json'),
  file = path.join(root, '.test-tools/focus/singleplayer.swf');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== review.inputHash) {
    const response = await fetch(review.sourceURL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Singleplayer source HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024 || hash(bytes) !== review.inputHash)
      throw Error('Local client changed; review it before rebuilding');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-audio.cjs'), '--singleplayer'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-adaptive.cjs'), '--singleplayer'], {
    stdio: 'inherit',
    windowsHide: true,
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
