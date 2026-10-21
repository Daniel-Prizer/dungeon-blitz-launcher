'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { stagePrevious, restorePrevious } = require('../src/rollback.cjs'),
  { verifyManifest } = require('../src/update-policy.cjs');
test('restore closes only after verification, preference snapshot/save and explicit scheduling; normal exit cannot install a rollback', async () => {
  const order = [],
    updater = {
      prepareRollback: async () => order.push('verified'),
      installAfterExit: (restart, explicit) => {
        assert(restart && explicit);
        order.push('scheduled');
        return true;
      },
    };
  await restorePrevious({
    updater,
    snapshot: () => order.push('snapshot'),
    disableUpdates: async () => order.push('updates-off'),
    close: () => order.push('closed'),
  });
  assert.deepEqual(order, ['verified', 'snapshot', 'updates-off', 'scheduled', 'closed']);
  assert.equal(updater.installAfterExit(), false, 'Close hook cannot schedule twice');
  for (const failed of ['verify', 'snapshot', 'save', 'schedule']) {
    let closed = false,
      saved = false;
    await assert.rejects(() =>
      restorePrevious({
        updater: {
          prepareRollback: async () => {
            if (failed === 'verify') throw Error('bad signature');
          },
          installAfterExit: () => false,
        },
        snapshot: () => {
          if (failed === 'snapshot') throw Error('disk full');
        },
        disableUpdates: () => {
          if (failed === 'save') throw Error('preferences locked');
          saved = true;
        },
        close: () => (closed = true),
      })
    );
    assert.equal(closed, false);
    if (['verify', 'snapshot'].includes(failed)) assert.equal(saved, false);
  }
  const { Updater } = require('../src/updater.cjs'),
    key = crypto.generateKeyPairSync('ed25519').publicKey,
    automatic = new Updater({
      current: '1.0.0',
      cache: 'unused',
      installRoot: 'unused',
      helper: 'unused',
      publicKey: key,
    });
  automatic.status.phase = 'rollback-ready';
  assert.equal(automatic.installAfterExit(false), false);
  assert.equal(
    automatic.installAfterExit(true),
    false,
    'Even restart without explicit restore must not downgrade'
  );
});
test('explicit rollback stages only the signed previous build, rejects tampering/links, and never relaxes automatic downgrade checks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blitz-rollback-')),
    key = crypto.generateKeyPairSync('ed25519'),
    version = '0.1.0',
    prefix = `release/${version}/Dungeon Blitz Launcher-win32-x64/`;
  const bodies = {
    'Dungeon Blitz Launcher.exe': Buffer.from('previous shim'),
    [prefix + 'Dungeon Blitz Launcher.exe']: Buffer.from('previous core'),
    [prefix + 'resources/app.asar']: Buffer.from('physical previous archive'),
  };
  const files = Object.entries(bodies).map(([name, bytes]) => {
    const file = path.join(
      root,
      name === 'Dungeon Blitz Launcher.exe' ? 'Dungeon Blitz Launcher.previous.exe' : name
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return {
      path: name,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  });
  const payload = Buffer.from(
      JSON.stringify({
        schema: 1,
        version,
        platform: 'win32-x64',
        zip: {
          name: `Dungeon-Blitz-Launcher-${version}-win64.zip`,
          size: 1,
          sha256: 'a'.repeat(64),
        },
        files,
      })
    ),
    envelope = {
      payload: payload.toString('base64'),
      signature: crypto.sign(null, payload, key.privateKey).toString('base64'),
    };
  const options = { envelope, key: key.publicKey, version, current: '0.2.0', root },
    stage = path.join(root, 'staged');
  const progress = [];
  const manifest = await stagePrevious({
    ...options,
    stage,
    progress: (n, total) => progress.push([n, total]),
  });
  assert.equal(manifest.version, version);
  assert.deepEqual(progress, [
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  for (const [name, bytes] of Object.entries(bodies))
    assert(fs.readFileSync(path.join(stage, name)).equals(bytes));
  assert.throws(
    () => verifyManifest(envelope, key.publicKey, '0.2.0'),
    'Automatic updates still reject downgrade'
  );
  await assert.rejects(() =>
    stagePrevious({ ...options, current: version, stage: path.join(root, 'same') })
  );
  await assert.rejects(() =>
    stagePrevious({ ...options, version: '0.0.9', stage: path.join(root, 'wrong') })
  );
  await assert.rejects(() =>
    stagePrevious({
      ...options,
      envelope: { ...envelope, signature: 'a'.repeat(88) },
      stage: path.join(root, 'bad-signature'),
    })
  );
  fs.writeFileSync(path.join(root, prefix + 'resources/app.asar'), 'bad');
  await assert.rejects(() => stagePrevious({ ...options, stage: path.join(root, 'tampered') }));
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() =>
    stagePrevious({ ...options, stage: path.join(root, 'cancelled'), signal: abort.signal })
  );
  const linked = path.join(root, 'linked'),
    target = path.join(root, 'target');
  fs.mkdirSync(target);
  fs.symlinkSync(target, linked, 'junction');
  await assert.rejects(() =>
    stagePrevious({ ...options, root: linked, stage: path.join(root, 'link-stage') })
  );
  // Fixture directories intentionally retained in the OS temp folder: no broad
  // cleanup can follow the deliberately introduced junction.
});
