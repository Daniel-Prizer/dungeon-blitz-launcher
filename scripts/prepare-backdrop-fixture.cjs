const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  assert = require('assert/strict'),
  { execFileSync } = require('child_process');
(async () => {
  const pin = require('../src/legacy/client-backdrop-oct19.json').asset,
    file = path.resolve(__dirname, '../.test-tools/wide-live-assets/LevelsOMM.swf');
  if (!fs.existsSync(file)) {
    const r = await fetch(pin.url);
    assert(r.ok);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const b = fs.readFileSync(file);
  assert.equal(b.length, pin.bytes);
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'), pin.sha256);
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'prepare-transition-fixture.cjs'), '--backdrop'],
    { stdio: 'inherit', windowsHide: true }
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
