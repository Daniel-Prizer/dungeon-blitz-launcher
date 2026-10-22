const { packager } = require('@electron/packager');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  if (process.argv.includes('--prepared-game')) {
    // Explicit build continuation after the complete game preparation passed.
    // Reject changed legacy source instead of packaging a stale ASAR.
    const archive = require('@electron/asar'),
      prepared = path.join(root, 'runtime/game/resources/app.asar');
    const check = (directory) => {
      for (const entry of fs.readdirSync(path.join(root, 'src/legacy', directory), {
        withFileTypes: true,
      })) {
        const name = path.join(directory, entry.name);
        if (entry.isDirectory()) check(name);
        else if (
          !archive
            .extractFile(prepared, name)
            .equals(fs.readFileSync(path.join(root, 'src/legacy', name)))
        )
          throw Error('Prepared game source changed: ' + name);
      }
    };
    check('');
    require('./runtime-import.cjs').verifyImported(
      path.join(root, 'runtime/game'),
      JSON.parse(fs.readFileSync(path.join(root, 'runtime/provenance.json'))).importedFiles
    );
  } else
    execFileSync(process.execPath, [path.join(__dirname, 'prepare-legacy.cjs')], {
      stdio: 'inherit',
    });
  await require('./prepare-webview-sdk.cjs')();
  require('./prepare-modern.cjs')();
  require('./prepare-native-player.cjs').verify(path.join(root, 'runtime/native-player'));
  if (!fs.existsSync(path.join(root, 'runtime/singleplayer/provenance.json')))
    throw Error('Prepare the owned singleplayer bundle before packaging.');
  const paths = await packager({
    dir: root,
    name: 'Dungeon Blitz Launcher',
    executableName: 'Dungeon Blitz Launcher',
    platform: 'win32',
    arch: 'x64',
    electronVersion: require('../package.json').devDependencies.electron,
    out: path.join(root, 'release', require('../package.json').version),
    overwrite: true,
    asar: true,
    prune: true,
    icon: fs.existsSync(path.join(root, 'assets/icon.ico'))
      ? path.join(root, 'assets/icon.ico')
      : undefined,
    extraResource: [path.join(root, 'runtime')],
    ignore: [
      /^\/artifacts($|\/)/,
      /^\/runtime($|\/)/,
      /^\/release($|\/)/,
      /^\/\.test-profile($|\/)/,
      /^\/\.probe-profile($|\/)/,
      /^\/\.test-tools($|\/)/,
      /^\/(?:Blitz Browser|Dungeon Blitz Launcher(?: Setup)?)\.exe$/,
      /^\/research($|\/)/,
      /^\/scripts($|\/)/,
      /^\/test($|\/)/,
      /^\/docs($|\/)/,
      /^\/\.git($|\/)/,
    ],
    win32metadata: {
      CompanyName: 'Dungeon Blitz Launcher',
      FileDescription: 'Dungeon Blitz Launcher for Dungeon Blitz',
      ProductName: 'Dungeon Blitz Launcher',
    },
  });
  const output = paths[0],
    executable = path.join(output, 'Dungeon Blitz Launcher.exe');
  // Unfinished projector experiments are source/tests only. A release must not
  // accidentally advertise or bundle a runtime which failed compatibility tests.
  const packagedRuntime = path.join(output, 'resources/runtime');
  // Keep update/rollback paths within the older native helper's limits. The
  // utility process can require/read this signed ASAR directly; local saves
  // remain outside it. Only this new packaged copy is removed afterward.
  const localSource = path.join(root, 'runtime/singleplayer'),
    localCopy = path.join(packagedRuntime, 'singleplayer');
  for (const name of fs.readdirSync(localSource, { recursive: true }))
    if (fs.lstatSync(path.join(localSource, name)).isSymbolicLink())
      throw Error('Singleplayer archive source contains a link');
  await require('@electron/asar').createPackageWithOptions(
    localSource,
    path.join(packagedRuntime, 'singleplayer.asar'),
    { unpackDir: 'content' }
  );
  if (
    fs.realpathSync(path.dirname(localCopy)) !== fs.realpathSync(packagedRuntime) ||
    fs.lstatSync(localCopy).isSymbolicLink()
  )
    throw Error('Unexpected packaged singleplayer copy');
  fs.rmSync(localCopy, { recursive: true, force: true });
  for (const name of ['SandboxHost.exe', 'projector']) {
    const item = path.join(packagedRuntime, name);
    if (fs.existsSync(item)) fs.rmSync(item, { recursive: true, force: true });
  }
  // A running source session can recreate its log while resources are copied.
  // Clean the copied output, leaving the active session's diagnostics alone.
  const diagnostics = path.join(output, 'resources/runtime/host-diagnostics.log');
  if (fs.existsSync(diagnostics)) fs.unlinkSync(diagnostics);
  const provenanceFile = path.join(output, 'resources/runtime/provenance.json');
  const provenance = JSON.parse(fs.readFileSync(provenanceFile, 'utf8'));
  provenance.importedFrom = 'Official Dungeon Blitz R installation (local path omitted)';
  fs.writeFileSync(provenanceFile, JSON.stringify(provenance, null, 2));
  require('./asar-integrity.cjs').register(executable, [
    path.join(output, 'resources/app.asar'),
    path.join(packagedRuntime, 'singleplayer.asar'),
  ]);
  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  fs.copyFileSync(path.join(root, 'README.md'), path.join(output, 'START HERE.txt'));
  fs.copyFileSync(path.join(root, 'SECURITY.md'), path.join(output, 'SECURITY.txt'));
  const version = require('../package.json').version;
  const [major, minor, patch] = version.split('.');
  const launcherSource = fs
    .readFileSync(path.join(root, 'src/Launcher.cs'), 'utf8')
    .replaceAll('@@VERSION@@', version)
    .replaceAll('@@MAJOR@@', major)
    .replaceAll('@@MINOR@@', minor)
    .replaceAll('@@PATCH@@', patch);
  fs.mkdirSync(path.join(root, '.test-tools'), { recursive: true });
  const generated = path.join(root, '.test-tools/Launcher.generated.cs');
  fs.writeFileSync(generated, launcherSource);
  const launcher = path.join(root, 'Dungeon Blitz Launcher.exe');
  execFileSync(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    [
      '/nologo',
      '/target:winexe',
      '/platform:x64',
      '/r:System.Windows.Forms.dll',
      `/win32icon:${path.join(root, 'assets/icon.ico')}`,
      `/out:${launcher}`,
      generated,
    ],
    { stdio: 'inherit' }
  );
  require('./verify-shim.cjs')();
  execFileSync(process.execPath, [path.join(__dirname, 'verify-package.cjs')], {
    stdio: 'inherit',
    windowsHide: true,
  });
  // Keep historical root shims, portable builds and agent-owned copies intact.
  console.log(`Root executable (always latest): ${launcher}`);
  console.log(`Ready: ${executable}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
