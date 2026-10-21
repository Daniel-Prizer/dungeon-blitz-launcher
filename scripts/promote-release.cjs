'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  stage = JSON.parse(fs.readFileSync(path.join(root, '.test-tools/release-stage.json'))).stage,
  version = require('../package.json').version;
const hold =
  'C:/Users/Daniel/.codex/automations/daily-dungeon-blitz-launcher-update/local-version-hold.json';
if (fs.existsSync(hold) && JSON.parse(fs.readFileSync(hold)).active)
  throw Error('Local version hold is active');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  output = path.join(stage, 'release', version),
  envelope = JSON.parse(
    fs.readFileSync(path.join(output, `Dungeon-Blitz-Launcher-${version}-update.json`))
  ),
  manifest = require('../src/update-policy.cjs').verifyManifest(
    envelope,
    fs.readFileSync(path.join(root, 'src/update-key.pem')),
    '0.0.0'
  );
assert.equal(manifest.version, version);
for (const file of manifest.files) {
  const source = path.join(stage, file.path),
    stat = fs.lstatSync(source);
  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.size, file.size);
  assert.equal(hash(source), file.sha256);
}
const setup = `Dungeon-Blitz-Launcher-${version}-Setup.exe`,
  zip = `Dungeon-Blitz-Launcher-${version}-win64.zip`;
for (const name of [setup, zip])
  assert.equal(
    hash(path.join(output, name)),
    fs.readFileSync(path.join(output, name + '.sha256'), 'utf8').split(/\s/)[0]
  );
assert.equal(hash(path.join(output, zip)), manifest.zip.sha256);
const target = path.join(root, 'release', version);
fs.mkdirSync(target, { recursive: true });
function preserveCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination))
    assert.equal(hash(destination), hash(source), 'An existing versioned artifact differs');
  else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}
for (const file of manifest.files.filter((f) => f.path !== 'Dungeon Blitz Launcher.exe'))
  preserveCopy(path.join(stage, file.path), path.join(root, file.path));
for (const name of [
  setup,
  setup + '.sha256',
  zip,
  zip + '.sha256',
  `Dungeon-Blitz-Launcher-${version}-update.json`,
])
  preserveCopy(path.join(output, name), path.join(target, name));
// Prior copies remain recoverable. Never run Setup or modify installed files,
// profiles, preferences, update opt-out or any running game/agent copy.
const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
  backups = path.join(root, 'artifacts', `before-${version}-${stamp}`);
fs.mkdirSync(backups, { recursive: true });
for (const name of ['Dungeon Blitz Launcher.exe', 'Dungeon Blitz Launcher Setup.exe'])
  if (fs.existsSync(path.join(root, name)))
    fs.copyFileSync(path.join(root, name), path.join(backups, name));
const downloads = path.resolve(root, '..'),
  canonical = path.join(downloads, 'Dungeon Blitz Launcher Setup.exe');
if (fs.existsSync(canonical))
  fs.copyFileSync(
    canonical,
    path.join(downloads, `Dungeon Blitz Launcher Setup before ${version} ${stamp}.exe`),
    fs.constants.COPYFILE_EXCL
  );
fs.copyFileSync(
  path.join(stage, 'Dungeon Blitz Launcher.exe'),
  path.join(root, 'Dungeon Blitz Launcher.exe')
);
fs.copyFileSync(path.join(output, setup), path.join(root, 'Dungeon Blitz Launcher Setup.exe'));
fs.copyFileSync(path.join(output, setup), canonical);
assert.equal(hash(canonical), hash(path.join(output, setup)));
const shim = require('./verify-shim.cjs')();
const record = {
  version,
  at: new Date().toISOString(),
  files: manifest.files.length,
  backups,
  shim,
  setupHash: hash(canonical),
  installed: false,
};
fs.writeFileSync(
  path.join(root, '.test-tools/promoted-release.json'),
  JSON.stringify(record, null, 2)
);
console.log(JSON.stringify(record, null, 2));
