'use strict';
// Prove the previous signed helper can install this complete release before
// the new helper is available. No real installation, launcher or game starts.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  version = require('../package.json').version,
  previous = path.resolve(process.argv[2] || ''),
  key = fs.readFileSync(path.join(root, 'src/update-key.pem'));
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const old = require('../src/update-policy.cjs').verifyManifest(
    JSON.parse(fs.readFileSync(previous)),
    key,
    '0.0.0'
  ),
  oldRoot = path.resolve(path.dirname(previous), '../..'),
  helperName =
    'release/' +
    old.version +
    '/Dungeon Blitz Launcher-win32-x64/resources/runtime/UpdateInstaller.exe',
  helper = path.join(oldRoot, helperName),
  expected = old.files.find((f) => f.path === helperName);
assert(expected);
assert.equal(digest(helper), expected.sha256);
assert.equal(fs.statSync(helper).size, expected.size);
const output = path.join(root, 'release', version),
  signed = JSON.parse(
    fs.readFileSync(path.join(output, 'Dungeon-Blitz-Launcher-' + version + '-update.json'))
  ),
  manifest = require('../src/update-policy.cjs').verifyManifest(signed, key, old.version),
  zip = path.join(output, manifest.zip.name);
assert.equal(digest(zip), manifest.zip.sha256);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buc-')),
  defaults = {
    source: path.join(process.env.APPDATA, 'dungeon-blitz-launcher/updates/stage-ABCDEF/files')
      .length,
    destination: path.join(process.env.LOCALAPPDATA, 'Programs/Dungeon Blitz Launcher').length,
  };
const sized = (letter, length) =>
    path.join(dir, letter.repeat(Math.max(1, length - dir.length - 1))),
  source = sized('s', defaults.source),
  destination = sized('d', defaults.destination);
assert(source.length >= defaults.source);
assert(destination.length >= defaults.destination);
let longestExtract = 0,
  longestAssembly = 0;
for (const file of manifest.files) {
  longestExtract = Math.max(longestExtract, path.join(source, file.path).length);
  if (file.path !== 'Dungeon Blitz Launcher.exe')
    longestAssembly = Math.max(
      longestAssembly,
      path.join(
        destination,
        'release',
        '.update-' + 'x'.repeat(32),
        file.path.slice(('release/' + version + '/').length)
      ).length
    );
}
assert(longestExtract < 260);
assert(longestAssembly < 260);
execFileSync(helper, ['extract', zip, source], {
  windowsHide: true,
  stdio: 'pipe',
  timeout: 120000,
});
(async () => {
  await require('../src/updater.cjs').verifyFiles(source, manifest);
  fs.mkdirSync(destination);
  const oldShim = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(oldRoot, 'Dungeon Blitz Launcher.exe');
  assert.equal(
    digest(oldShim),
    old.files.find((f) => f.path === 'Dungeon Blitz Launcher.exe').sha256
  );
  // A non-running retained shim is sufficient to exercise versioned backup.
  fs.copyFileSync(oldShim, path.join(destination, 'Dungeon Blitz Launcher.exe'));
  const oldHash = digest(oldShim),
    config = path.join(dir, 'install.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      version,
      source,
      destination,
      pid: 2147483647,
      pids: [2147483647],
      files: manifest.files,
    })
  );
  execFileSync(helper, ['install', config, 'close'], {
    windowsHide: true,
    stdio: 'pipe',
    timeout: 120000,
  });
  await require('../src/updater.cjs').verifyFiles(path.join(destination, 'release', version), {
    files: manifest.files
      .filter((f) => f.path !== 'Dungeon Blitz Launcher.exe')
      .map((f) => ({ ...f, path: f.path.slice(('release/' + version + '/').length) })),
  });
  assert.equal(
    digest(path.join(destination, 'Dungeon Blitz Launcher.exe')),
    manifest.files.find((f) => f.path === 'Dungeon Blitz Launcher.exe').sha256
  );
  assert.equal(digest(path.join(destination, 'Dungeon Blitz Launcher.previous.exe')), oldHash);
  require('./verify-shim.cjs')(root, destination, version);
  const receipt = {
    ok: true,
    version,
    previous: old.version,
    helperHash: expected.sha256,
    files: manifest.files.length,
    longestExtract,
    longestAssembly,
    defaultCacheAndInstallLengths: defaults,
    directory: dir,
    scope:
      'Retained signed native helper extracts, verifies and installs full new signed payload; all installed hashes and old shim preserved; genuine verification probe only; no application started',
  };
  fs.writeFileSync(
    path.join(root, 'artifacts/previous-updater-' + version + '.json'),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify(receipt));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
