const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options, FuseState } = require('@electron/fuses');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const output = path.join(root, 'release', version, 'Dungeon Blitz Launcher-win32-x64');
const archive = path.join(output, 'resources/app.asar');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const checked = [];
  function compare(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes:true })) {
      const relative = path.join(dir,entry.name);
      if (entry.isDirectory()) compare(relative);
      else { assert.deepEqual(asar.extractFile(archive,relative),fs.readFileSync(path.join(root,relative)),relative);checked.push(relative); }
    }
  }
  compare('src');
  compare('assets');
  const local=path.join(output,'resources/runtime/singleplayer.asar'),localSource=path.join(root,'runtime/singleplayer');
  assert(fs.statSync(local).isFile());assert(!fs.existsSync(path.join(output,'resources/runtime/singleplayer')));
  const unpacked=local+'.unpacked',physical=[];
  function physicalFiles(dir,relative=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=relative?relative+'/'+entry.name:entry.name;assert(!entry.isSymbolicLink());if(entry.isDirectory())physicalFiles(path.join(dir,entry.name),name);else physical.push(name);}}physicalFiles(unpacked);
  assert(physical.length>100);for(const name of physical){assert(name.startsWith('content/'),'Only static content may be unpacked');assert.equal(hash(path.join(unpacked,name)),hash(path.join(localSource,name)),name);}
  for(const name of asar.listPackage(local)){const relative=name.replace(/^[\\/]/,'');const stat=asar.statFile(local,path.normalize(relative));if(!stat.files)assert.equal(Boolean(stat.unpacked),relative.startsWith('content'+path.sep)||relative.startsWith('content/'),'Static streaming metadata: '+relative);}
  const localBytes=name=>asar.extractFile(local,path.normalize(name)),localHash=name=>require('crypto').createHash('sha256').update(localBytes(name)).digest('hex');
  const localProvenance=JSON.parse(localBytes('provenance.json'));
  assert.equal(localProvenance.commit,require('./prepare-owned-singleplayer.cjs').commit);
  for(const [name,expected]of Object.entries(localProvenance.files))assert.equal(localHash(name),expected,name);
  assert.equal(localHash('client.swf'),require('../src/legacy/client-singleplayer.json').inputHash);
  function checkLocal(dir=''){for(const item of fs.readdirSync(path.join(localSource,dir),{withFileTypes:true})){const name=dir?dir+'/'+item.name:item.name;assert(!item.isSymbolicLink());assert(!/(^|\/)(Accounts\.json|saves|instance\.lock|\.env)$/i.test(name));if(item.isDirectory())checkLocal(name);else assert.equal(localHash(name),hash(path.join(localSource,name)),name);}}checkLocal();
  const modern=path.join(output,'resources/runtime/modern');
  for(const name of fs.readdirSync(path.join(root,'runtime/modern'),{withFileTypes:true}))if(name.isFile())assert.equal(hash(path.join(modern,name.name)),hash(path.join(root,'runtime/modern',name.name)),name.name);
  for(const name of fs.readdirSync(path.join(root,'runtime/modern/resources')))assert.equal(hash(path.join(modern,'resources',name)),hash(path.join(root,'runtime/modern/resources',name)),name);
  for(const name of ['runtime.json','assets.json','entry.mjs','render-worker.mjs','input.mjs','crosshair.js'])assert(fs.existsSync(path.join(modern,'resources',name)),name+' must be packaged');
  for(const name of ['bootstrap.js','entry.mjs','session.mjs','render-worker.mjs'])assert(!/GPU_PRIVATE_QA|__ownGpuSession|device-loss|OwnRunProbe/.test(fs.readFileSync(path.join(modern,'resources',name),'utf8')),'Private QA must not ship: '+name);
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version, version);
  const legacy = path.join(output,'resources/runtime/game/resources/app.asar');
  assert.deepEqual(asar.extractFile(legacy,'main.cjs'),fs.readFileSync(path.join(root,'src/legacy/main.cjs')));
  assert.deepEqual(asar.extractFile(legacy,'editing.cjs'),fs.readFileSync(path.join(root,'src/legacy/editing.cjs')));
  for(const file of ['client-patch.cjs','client-layout.json','client-layout-current.json','client-layout-latest.json','client-layout-oct11.json','client-deployment.json','adaptive-patch.cjs','swf-contract.cjs','links.cjs','audio-patch.cjs','rendering.cjs','transport.cjs','mount-shortcut.cjs','BlitzInput.as','BlitzAudio.as','BlitzDisplay.as','BlitzFrameCounter.as'])assert.deepEqual(asar.extractFile(legacy,file),fs.readFileSync(path.join(root,'src/legacy',file)));
  assert.equal(JSON.parse(asar.extractFile(legacy,'package.json')).version,version);
  assert.deepEqual(asar.extractFile(legacy,'crosshair.js'),fs.readFileSync(path.join(root,'src/crosshair.js')));
  assert.deepEqual(asar.extractFile(legacy,'autorun-binding.js'),fs.readFileSync(path.join(root,'src/autorun-binding.js')));
  assert.deepEqual(asar.extractFile(legacy,'client-transition-oct15.json'),fs.readFileSync(path.join(root,'src/legacy/client-transition-oct15.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-oct15.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-oct15.json')));
  assert.deepEqual(asar.extractFile(legacy,'client-interface-oct16.json'),fs.readFileSync(path.join(root,'src/legacy/client-interface-oct16.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-oct16.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-oct16.json')));
  assert.deepEqual(asar.extractFile(legacy,'client-crop-oct17.json'),fs.readFileSync(path.join(root,'src/legacy/client-crop-oct17.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-oct17.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-oct17.json')));
  assert.deepEqual(asar.extractFile(legacy,'client-recovery-oct17.json'),fs.readFileSync(path.join(root,'src/legacy/client-recovery-oct17.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-recovery-oct17.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-recovery-oct17.json')));
  assert.deepEqual(asar.extractFile(legacy,'client-map-recovery-oct19.json'),fs.readFileSync(path.join(root,'src/legacy/client-map-recovery-oct19.json')));
  assert.deepEqual(asar.extractFile(legacy,'client-backdrop-oct19.json'),fs.readFileSync(path.join(root,'src/legacy/client-backdrop-oct19.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-backdrop-oct19.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-backdrop-oct19.json')));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-map-oct19.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-map-oct19.json')));
  for(const file of ['client-adapter.cjs','client-singleplayer.json','game-address.cjs','local-icon-patch.cjs','local-icon-fallback.json','icon-fallback/a_PowerIcon_MeteorROR.as','icon-fallback/a_PowerIcon_CrimsonShot.as'])assert.deepEqual(asar.extractFile(legacy,file),fs.readFileSync(path.join(root,'src/legacy',file)));
  assert.equal(hash(path.join(output,'resources/runtime/game/resources/adaptive-contract-singleplayer.json')),hash(path.join(root,'runtime/game/resources/adaptive-contract-singleplayer.json')));
  for(const file of ['NativeHost.exe','UpdateInstaller.exe','game/BlitzGame.exe','game/resources/pepflashplayer64.dll','game/resources/game-window.node','game/resources/audio-delta.json','game/resources/audio-delta-current.json','game/resources/audio-delta-latest.json','game/resources/audio-delta-oct11.json','game/resources/adaptive-contract.json'])
    assert.equal(hash(path.join(output,'resources/runtime',file)),hash(path.join(root,'runtime',file)),file);
  const files = asar.listPackage(archive);
  assert(!files.some(file=>file.startsWith('/artifacts/')),'Downloaded research artifacts must not ship');
  for(const file of ['SandboxHost.exe','projector'])assert(!fs.existsSync(path.join(output,'resources/runtime',file)),'Unfinished projector runtime must not ship');
  assert(!files.some(file=>/neural|cunny|upscaler/i.test(file)),'Retired enhancement source/model must not ship');
  assert(!asar.listPackage(legacy).some(file=>/neural/i.test(file)),'Retired game-host enhancer must not ship');
  for(const file of ['game/resources/neural-window.node','game/resources/NeuralWindow.lib','game/resources/NeuralWindow.exp','game/resources/neural','host-diagnostics.log'])assert(!fs.existsSync(path.join(output,'resources/runtime',file)),'Retired enhancer or diagnostic must not ship: '+file);
  const provenance=JSON.parse(fs.readFileSync(path.join(output,'resources/runtime/provenance.json'),'utf8'));
  assert.equal(provenance.importedFrom,'Official Dungeon Blitz R installation (local path omitted)','Personal installation path must not ship');
  for(const obsolete of ['home.html','home.css','game.cjs','socket-bridge.cjs'])assert(!files.includes('/src/'+obsolete),'Removed browser component must not ship: '+obsolete);
  assert(!files.some(file=>file.includes('node_modules/@ruffle-rs')||file.startsWith('/node_modules/ws/')),'Removed runtime alternatives and socket bridge dependencies must not ship');
  assert(!files.some(f=>/[/\\](?:\.test-profile|\.probe-profile|\.test-tools|scripts|docs)(?:[/\\]|$)/.test(f)),'Test data and tools must be excluded');
  const fuses = await getCurrentFuseWire(path.join(output,'Dungeon Blitz Launcher.exe'));
  for(const name of ['RunAsNode','EnableNodeOptionsEnvironmentVariable','EnableNodeCliInspectArguments','GrantFileProtocolExtraPrivileges'])assert.equal(fuses[FuseV1Options[name]],FuseState.DISABLE,name);
  for(const name of ['EnableCookieEncryption','EnableEmbeddedAsarIntegrityValidation','OnlyLoadAppFromAsar'])assert.equal(fuses[FuseV1Options[name]],FuseState.ENABLE,name);
  require('./verify-shim.cjs')();
  fs.writeFileSync(path.join(root,'docs/package-test-results.json'),JSON.stringify({time:new Date().toISOString(),version,checked,appHash:hash(archive),legacyHash:hash(legacy),launcherHash:hash(path.join(root,'Dungeon Blitz Launcher.exe')),passed:['Packaged source matches tested source','Packaged Flash host matches tested source and binary runtime','Retired enhancement controls, source, native module and model excluded','Test profiles excluded','Security fuses match intended values','Byte-identical root IL verifies matching core and rejects a missing core through a naturally named probe']},null,2));
  console.log('PASS Packaged source, original/GPU runtimes, private QA absence, fuses and byte-identical root-shim logic');
})().catch(error=>{console.error(error);process.exitCode=1});
