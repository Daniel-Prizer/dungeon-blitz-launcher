const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const storage = require('../scripts/build-storage.cjs');
const { execFileSync } = require('node:child_process');
const stageRelease = require('../scripts/stage-release.cjs');

test('staging copies source edits without ignored caches, nested artifacts or duplicate stages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blitz-staging-'));
  try {
    execFileSync('git', ['init', '--quiet', dir], { windowsHide: true });
    fs.writeFileSync(path.join(dir, '.gitignore'), '**/artifacts/\n.test-tools/\nnode_modules/\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"1.2.3"}');
    for (const name of ['runtime', 'src', 'research', 'node_modules'])
      fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, 'src', 'new.cjs'), 'module.exports=42;');
    fs.writeFileSync(path.join(dir, 'runtime', 'fixture.bin'), 'runtime');
    fs.mkdirSync(path.join(dir, 'research', 'artifacts'));
    fs.writeFileSync(path.join(dir, 'research', 'artifacts', 'old-build'), 'never copy this');
    const result = stageRelease(dir);
    assert.equal(
      fs.readFileSync(path.join(result.stage, 'src/new.cjs'), 'utf8'),
      'module.exports=42;'
    );
    assert.equal(
      fs.readFileSync(path.join(result.stage, 'runtime/fixture.bin'), 'utf8'),
      'runtime'
    );
    assert(!fs.existsSync(path.join(result.stage, 'research/artifacts')));
    assert(fs.lstatSync(path.join(result.stage, '.test-tools')).isSymbolicLink());
    assert.throws(() => stageRelease(dir), /already exists/);
    assert.throws(() => stageRelease(result.stage), /inside another stage/);
    assert.equal(fs.readdirSync(path.join(dir, 'artifacts')).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('builds retain disk headroom and reject growing scratch beyond budget', () => {
  const G = storage.GiB;
  assert.throws(() => storage.check({ free: 21 * G, planned: 2 * G }), /20 GiB/);
  assert.throws(() => storage.check({ free: 100 * G, scratch: 63 * G, planned: 2 * G }), /64 GiB/);
  assert.deepEqual(storage.check({ free: 22 * G, scratch: 62 * G, planned: 2 * G }), {
    free: 22 * G,
    scratch: 62 * G,
    planned: 2 * G,
    archives: 0,
  });
  assert.throws(() => storage.check({ free: NaN }), /Invalid/);
  assert.throws(() => storage.check({ free: 100 * G, archives: 33 * G }), /32 GiB/);
});

test('storage scans never follow junctions and temporary cleanup cannot escape its parent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blitz-storage-'));
  try {
    const own = path.join(dir, 'own'),
      external = path.join(dir, 'external');
    fs.mkdirSync(own);
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'keep'), 'persistent');
    fs.symlinkSync(
      external,
      path.join(own, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    assert.equal(storage.files(own).length, 0);
    assert.throws(() => storage.removeTemporary(external, own, 'external'));
    assert.throws(() => storage.removeTemporary(path.join(own, 'link'), own, 'link'));
    const scratch = fs.mkdtempSync(path.join(own, 'scratch-'));
    storage.removeTemporary(scratch, own, 'scratch-');
    assert(!fs.existsSync(scratch));
    assert.equal(fs.readFileSync(path.join(external, 'keep'), 'utf8'), 'persistent');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
