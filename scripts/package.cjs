const { packager } = require('@electron/packager');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-legacy.cjs')], { stdio: 'inherit' });
  const paths = await packager({
    dir: root, name: 'Dungeon Blitz Launcher', executableName: 'Dungeon Blitz Launcher', platform: 'win32', arch: 'x64',
    electronVersion: require('../package.json').devDependencies.electron,
    out: path.join(root, 'release', require('../package.json').version), overwrite: true, asar: true, prune: true,
    icon: fs.existsSync(path.join(root, 'assets/icon.ico')) ? path.join(root, 'assets/icon.ico') : undefined,
    extraResource: [path.join(root, 'runtime')],
    ignore: [/^\/artifacts($|\/)/, /^\/runtime($|\/)/, /^\/release($|\/)/, /^\/\.test-profile($|\/)/, /^\/\.probe-profile($|\/)/, /^\/\.test-tools($|\/)/, /^\/(?:Blitz Browser|Dungeon Blitz Launcher)\.exe$/, /^\/scripts($|\/)/, /^\/test($|\/)/, /^\/docs($|\/)/, /^\/\.git($|\/)/],
    win32metadata: { CompanyName: 'Dungeon Blitz Launcher', FileDescription: 'Dungeon Blitz Launcher for Dungeon Blitz', ProductName: 'Dungeon Blitz Launcher' },
  });
  const output = paths[0], executable = path.join(output, 'Dungeon Blitz Launcher.exe');
  // Unfinished projector experiments are source/tests only. A release must not
  // accidentally advertise or bundle a runtime which failed compatibility tests.
  const packagedRuntime=path.join(output,'resources/runtime');
  for(const name of ['SandboxHost.exe','projector']){const item=path.join(packagedRuntime,name);if(fs.existsSync(item))fs.rmSync(item,{recursive:true,force:true});}
  // A running source session can recreate its log while resources are copied.
  // Clean the copied output, leaving the active session's diagnostics alone.
  const diagnostics=path.join(output,'resources/runtime/host-diagnostics.log');if(fs.existsSync(diagnostics))fs.unlinkSync(diagnostics);
  const provenanceFile=path.join(output,'resources/runtime/provenance.json');
  const provenance=JSON.parse(fs.readFileSync(provenanceFile,'utf8'));
  provenance.importedFrom='Official Dungeon Blitz R installation (local path omitted)';
  fs.writeFileSync(provenanceFile,JSON.stringify(provenance,null,2));
  await flipFuses(executable, { version: FuseVersion.V1,
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
  const version=require('../package.json').version;
  const [major,minor,patch]=version.split('.');
  const launcherSource=fs.readFileSync(path.join(root,'src/Launcher.cs'),'utf8').replaceAll('@@VERSION@@',version).replaceAll('@@MAJOR@@',major).replaceAll('@@MINOR@@',minor).replaceAll('@@PATCH@@',patch);
  fs.mkdirSync(path.join(root,'.test-tools'),{recursive:true});
  const generated=path.join(root,'.test-tools/Launcher.generated.cs');fs.writeFileSync(generated,launcherSource);
  const launcher=path.join(root,'Dungeon Blitz Launcher.exe');
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:winexe','/platform:x64','/r:System.Windows.Forms.dll',`/win32icon:${path.join(root,'assets/icon.ico')}`,`/out:${launcher}`,generated],{stdio:'inherit'});
  execFileSync(launcher,['--verify'],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'verify-package.cjs')],{stdio:'inherit',windowsHide:true});
  // Remove only the obsolete root shim after its replacement is verified.
  // Historical portable builds and any running old session are left intact.
  const previousLauncher=path.join(root,'Blitz Browser.exe');
  if(fs.existsSync(previousLauncher))fs.unlinkSync(previousLauncher);
  console.log(`Root executable (always latest): ${launcher}`);
  console.log(`Ready: ${executable}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
