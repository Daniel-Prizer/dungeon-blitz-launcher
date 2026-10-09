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
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version, version);
  const legacy = path.join(output,'resources/runtime/game/resources/app.asar');
  assert.deepEqual(asar.extractFile(legacy,'main.cjs'),fs.readFileSync(path.join(root,'src/legacy/main.cjs')));
  assert.deepEqual(asar.extractFile(legacy,'editing.cjs'),fs.readFileSync(path.join(root,'src/legacy/editing.cjs')));
  for(const file of ['client-patch.cjs','client-layout.json','links.cjs','audio-patch.cjs','BlitzAudio.as','neural.cjs'])assert.deepEqual(asar.extractFile(legacy,file),fs.readFileSync(path.join(root,'src/legacy',file)));
  assert.equal(JSON.parse(asar.extractFile(legacy,'package.json')).version,version);
  for(const file of ['NativeHost.exe','game/BlitzGame.exe','game/resources/pepflashplayer64.dll','game/resources/game-window.node','game/resources/neural-window.node','game/resources/neural/passes.json','game/resources/neural/CuNNy-veryfast-NVL.hlsl','game/resources/neural/NOTICE.txt','game/resources/neural/COPYING.GPL3','game/resources/neural/COPYING.LESSER','game/resources/audio-delta.json'])
    assert.equal(hash(path.join(output,'resources/runtime',file)),hash(path.join(root,'runtime',file)),file);
  const files = asar.listPackage(archive);
  for(const obsolete of ['home.html','home.css','game.cjs','socket-bridge.cjs'])assert(!files.includes('/src/'+obsolete),'Removed browser component must not ship: '+obsolete);
  assert(!files.some(file=>file.includes('node_modules/@ruffle-rs')||file.startsWith('/node_modules/ws/')),'Removed runtime alternatives and socket bridge dependencies must not ship');
  assert(!files.some(f=>/[/\\](?:\.test-profile|\.probe-profile|\.test-tools|scripts|docs)(?:[/\\]|$)/.test(f)),'Test data and tools must be excluded');
  const fuses = await getCurrentFuseWire(path.join(output,'Dungeon Blitz Launcher.exe'));
  for(const name of ['RunAsNode','EnableNodeOptionsEnvironmentVariable','EnableNodeCliInspectArguments','GrantFileProtocolExtraPrivileges'])assert.equal(fuses[FuseV1Options[name]],FuseState.DISABLE,name);
  for(const name of ['EnableCookieEncryption','EnableEmbeddedAsarIntegrityValidation','OnlyLoadAppFromAsar'])assert.equal(fuses[FuseV1Options[name]],FuseState.ENABLE,name);
  execFileSync(path.join(root,'Dungeon Blitz Launcher.exe'),['--verify'],{windowsHide:true,stdio:'inherit'});
  fs.writeFileSync(path.join(root,'docs/package-test-results.json'),JSON.stringify({time:new Date().toISOString(),version,checked,appHash:hash(archive),legacyHash:hash(legacy),launcherHash:hash(path.join(root,'Dungeon Blitz Launcher.exe')),passed:['Packaged source matches tested source','Packaged Flash host matches tested source and binary runtime','Test profiles excluded','Security fuses match intended values','Root executable resolves matching version without opening UI']},null,2));
  console.log('PASS Packaged source, runtime, fuses and root executable verification');
})().catch(error=>{console.error(error);process.exitCode=1});
