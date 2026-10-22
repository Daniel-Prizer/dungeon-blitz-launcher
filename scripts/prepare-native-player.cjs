'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function prepare(source, target) {
  const record = JSON.parse(fs.readFileSync(path.join(root, 'research/native-player/build.json')));
  const patch = fs.readFileSync(path.join(root, 'research/native-player/ruffle.patch'));
  if (digest(patch) !== record.patchSha256)
    throw Error('Native source patch changed after qualification');
  for (const [name, expected] of Object.entries(record.files)) {
    const file = path.join(source, name),
      stat = fs.lstatSync(file);
    if (
      !/^[A-Za-z0-9_.-]+$/.test(name) ||
      stat.isSymbolicLink() ||
      stat.size > 64 * 1024 * 1024 ||
      digest(fs.readFileSync(file)) !== expected
    )
      throw Error('Unverified native runtime file: ' + name);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const name of Object.keys(record.files))
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  fs.writeFileSync(path.join(target, 'provenance.json'), JSON.stringify(record, null, 2) + '\n');
  return record;
}
function verify(target) {
  const expected = JSON.parse(
    fs.readFileSync(path.join(root, 'research/native-player/build.json'))
  );
  if (
    digest(fs.readFileSync(path.join(root, 'research/native-player/ruffle.patch'))) !==
    expected.patchSha256
  )
    throw Error('Native source patch changed after qualification');
  const actual = JSON.parse(fs.readFileSync(path.join(target, 'provenance.json')));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error('Native runtime provenance changed');
  const names = fs.readdirSync(target).sort(),
    allowed = [...Object.keys(expected.files), 'provenance.json'].sort();
  if (JSON.stringify(names) !== JSON.stringify(allowed))
    throw Error('Unexpected native runtime files');
  for (const [name, sha256] of Object.entries(expected.files)) {
    const file = path.join(target, name);
    if (fs.lstatSync(file).isSymbolicLink() || digest(fs.readFileSync(file)) !== sha256)
      throw Error('Native runtime hash mismatch: ' + name);
  }
  return expected;
}
if (require.main === module) {
  if (process.argv.length !== 4)
    throw Error(
      'Usage: node scripts/prepare-native-player.cjs <verified-distribution-directory> <runtime-directory>'
    );
  prepare(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
  verify(path.resolve(process.argv[3]));
  console.log('Verified native 120 FPS runtime imported.');
}
module.exports = { prepare, verify };
