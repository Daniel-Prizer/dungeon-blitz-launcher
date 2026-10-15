const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const {verifyImported,inventorySource}=require('./runtime-import.cjs');
const root = path.resolve(__dirname, '..');
const source = path.join(process.env.LOCALAPPDATA, 'Programs/Dungeon Blitz R');
const target = path.join(root, 'runtime/game');
(async () => {
  await require('./build-game-window.cjs')();
  // Remove only the retired enhancer's known generated resources. An unknown
  // file prevents removing its directory rather than broadening this cleanup.
  for (const relative of ['neural-window.node','NeuralWindow.lib','NeuralWindow.exp','neural/passes.json','neural/CuNNy-4x16-NVL.hlsl','neural/CuNNy-veryfast-NVL.hlsl','neural/NOTICE.txt','neural/COPYING.GPL3','neural/COPYING.LESSER']) {
    const file=path.join(target,'resources',relative);
    if(fs.existsSync(file))fs.unlinkSync(file);
  }
  const retired=path.join(target,'resources/neural');
  if(fs.existsSync(retired))fs.rmdirSync(retired);
  const installed=fs.existsSync(path.join(source,'Dungeon Blitz R.exe'));
  let importedFiles;
  if(!installed){
    let previous;try{previous=JSON.parse(fs.readFileSync(path.join(root,'runtime/provenance.json'),'utf8'));}catch{}
    importedFiles=verifyImported(target,previous?.importedFiles);
    console.log('Using the complete verified runtime import; the official launcher is not required.');
  }
  fs.mkdirSync(path.join(target, 'resources'), { recursive: true });
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64','/main:UpdateInstaller','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll',`/out:${path.join(root,'runtime/UpdateInstaller.exe')}`,path.join(root,'src/UpdateInstaller.cs'),path.join(root,'src/InstallMaintenance.cs')],{stdio:'inherit',windowsHide:true});
  for (const name of installed?fs.readdirSync(source):[]) {
    if (['resources', 'Uninstall Dungeon Blitz R.exe'].includes(name)) continue;
    const dest = path.join(target, name === 'Dungeon Blitz R.exe' ? 'BlitzGame.exe' : name);
    if (!fs.existsSync(dest)) fs.cpSync(path.join(source, name), dest, { recursive: true });
  }
  const plugin = path.join(source, 'resources/vendor/flash/win32/pepflashplayer64.dll');
  if (installed&&!fs.existsSync(path.join(target, 'resources/pepflashplayer64.dll'))) fs.copyFileSync(plugin, path.join(target, 'resources/pepflashplayer64.dll'));
  if(installed)importedFiles=verifyImported(target,inventorySource(source));
  execFileSync(process.execPath,[path.join(__dirname,'prepare-audio.cjs')],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-audio.cjs'),'--current'],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-audio.cjs'),'--latest'],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-audio.cjs'),'--oct11'],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-adaptive.cjs')],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-transition-contract.cjs')],{stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,[path.join(__dirname,'prepare-singleplayer.cjs')],{stdio:'inherit',windowsHide:true});
  fs.copyFileSync(path.join(root,'src/crosshair.js'),path.join(root,'src/legacy/crosshair.js'));
  await asar.createPackage(path.join(root, 'src/legacy'), path.join(target, 'resources/app.asar'));
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe', ['/nologo', '/target:exe', '/platform:x64', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll', `/out:${path.join(root, 'runtime/NativeHost.exe')}`, ...['NativeHost.cs','CursorLock.cs','GameAudio.cs','AccessibilityShortcuts.cs'].map(name=>path.join(root,'src',name))], { stdio: 'inherit' });
  const hashes = {};
  for (const relative of ['BlitzGame.exe', 'resources/pepflashplayer64.dll', 'resources/game-window.node']) hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(path.join(target, relative))).digest('hex');
  fs.writeFileSync(path.join(root, 'runtime/provenance.json'), JSON.stringify({ importedFrom: source, importedAt: new Date().toISOString(), flashVersion: '32.0.0.363', hashes, importedFiles, note: 'Imported from the user’s existing installation for local use. Original Flash and the legacy Chromium engine remain unsupported. Review third-party redistribution rights before sharing.' }, null, 2));
  console.log('Prepared game runtime and native window host.');
})().catch(error => { console.error(error); process.exitCode = 1; });
