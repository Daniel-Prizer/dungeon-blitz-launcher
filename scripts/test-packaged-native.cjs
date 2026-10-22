'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  version = require('../package.json').version;

async function probe(config) {
  const { app } = require('electron'),
    fs = require('node:fs'),
    path = require('node:path'),
    assert = require('node:assert/strict');
  app.disableHardwareAcceleration();
  app.setPath('userData', path.join(config.out, 'empty-profile'));
  await app.whenReady();
  if (!process.env.BLITZ_PRIVATE_DESKTOP?.startsWith('BlitzTest-'))
    throw Error('Inactive desktop required');
  const { prepare } = require(
    path.join(process.resourcesPath, 'verified-app.asar/src/native-player-resources.cjs')
  );
  const resources = await prepare(
    path.join(process.resourcesPath, 'runtime'),
    config.origin,
    AbortSignal.timeout(90000),
    path.join(config.out, 'public-assets')
  );
  try {
    assert.equal(resources.evidence.artwork.length, 73);
    assert.equal(resources.evidence.artwork.filter((v) => /^Levels/.test(v.name)).length, 21);
    const level = resources.evidence.artwork.find((v) => v.name === 'LevelsBT.swf');
    const response = await fetch(resources.brokerURL + level.pathname, {
      headers: { 'x-blitz-resource-token': resources.token },
    });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
      level.sha256
    );
    assert.equal((await fetch(resources.brokerURL + level.pathname)).status, 403);
    assert.equal(
      (
        await fetch(resources.brokerURL + '/p/cbp/LevelsUnknown.swf', {
          headers: { 'x-blitz-resource-token': resources.token },
        })
      ).status,
      404
    );
    fs.writeFileSync(
      path.join(config.out, 'receipt.json'),
      JSON.stringify({
        ok: true,
        sourceSha256: resources.evidence.sourceSha256,
        resources: 73,
        levels: 21,
        scope:
          'Actual packaged native resource module under production fuses; anonymous public assets and authenticated local broker, no game or account',
      })
    );
  } finally {
    resources.close();
  }
  app.quit();
}

(async () => {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const out = fs.mkdtempSync(path.join(root, 'artifacts/packaged-native-resources-')),
    source = path.join(out, 'source');
  const packaged = path.join(
    root,
    'release',
    version,
    'Dungeon Blitz Launcher-win32-x64/resources'
  );
  fs.mkdirSync(source);
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({ name: 'packaged-native-resource-fixture', version, main: 'main.cjs' })
  );
  const origin =
    process.argv.find((v) => v.startsWith('--origin='))?.slice(9) ||
    'https://dungeonblitzr.theminesa.studio/';
  fs.writeFileSync(
    path.join(source, 'main.cjs'),
    `(${probe.toString()})(${JSON.stringify({ out, origin })}).catch(error=>{require('fs').writeFileSync(${JSON.stringify(path.join(out, 'failure.txt'))},error.stack);require('electron').app.exit(1);});`
  );
  const [directory] = await require('@electron/packager').packager({
    dir: source,
    name: 'PackagedNativeResourceFixture',
    executableName: 'PackagedNativeResourceFixture',
    platform: 'win32',
    arch: 'x64',
    electronVersion: require('../package.json').devDependencies.electron,
    out: path.join(out, 'package'),
    asar: true,
    prune: false,
    overwrite: false,
  });
  const resource = path.join(directory, 'resources'),
    exe = path.join(directory, 'PackagedNativeResourceFixture.exe'),
    target = path.join(resource, 'verified-app.asar');
  fs.copyFileSync(path.join(packaged, 'app.asar'), target);
  const contracts = path.join(resource, 'runtime/game/resources');
  fs.mkdirSync(contracts, { recursive: true });
  for (const name of fs
    .readdirSync(path.join(packaged, 'runtime/game/resources'))
    .filter((name) => name.endsWith('.json')))
    fs.copyFileSync(
      path.join(packaged, 'runtime/game/resources', name),
      path.join(contracts, name)
    );
  const archives = [path.join(resource, 'app.asar'), target];
  require('./asar-integrity.cjs').register(exe, archives);
  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  require('./asar-integrity.cjs').verify(exe, archives);
  const runner = path.join(out, 'run.cjs');
  fs.writeFileSync(
    runner,
    `require('child_process').execFileSync(${JSON.stringify(exe)},[],{windowsHide:true,stdio:'inherit',timeout:100000});`
  );
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 110000,
  });
  if (!fs.existsSync(path.join(out, 'receipt.json')))
    throw Error(
      fs.existsSync(path.join(out, 'failure.txt'))
        ? fs.readFileSync(path.join(out, 'failure.txt'), 'utf8')
        : 'Packaged native resource test did not complete'
    );
  console.log('PASS packaged native resource admission and dungeon broker: ' + out);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
