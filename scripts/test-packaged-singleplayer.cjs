'use strict';
// Exercise the actual packaged ASAR modules and server through an independent
// Electron fixture. No production executable, game window, account or profile.
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  version = require('../package.json').version;
(async () => {
  const out = fs.mkdtempSync(path.join(root, 'artifacts/packaged-local-world-')),
    source = path.join(out, 'source'),
    packaged = path.join(root, 'release', version, 'Dungeon Blitz Launcher-win32-x64/resources');
  fs.mkdirSync(source);
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({ name: 'packaged-world-pipeline-fixture', version, main: 'main.cjs' })
  );
  fs.writeFileSync(
    path.join(source, 'main.cjs'),
    `const {app,utilityProcess}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');app.disableHardwareAcceleration();app.setPath('userData',${JSON.stringify(path.join(out, 'empty-profile'))});
app.whenReady().then(async()=>{const {Singleplayer}=require(${'path.join(process.resourcesPath,"verified-app.asar/src/singleplayer.cjs")'}),world=${JSON.stringify(path.join(out, 'disposable-world'))},server=new Singleplayer({bundle:${'path.join(process.resourcesPath,"runtime/singleplayer.asar")'},dataDir:world,fork:(...args)=>utilityProcess.fork(...args)});try{const first=await server.start();assert.notEqual(first.ports.http,first.ports.game);const response=await fetch(first.url+'p/cbp/DungeonBlitz.swf');assert(response.ok);assert.equal(require('crypto').createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),'9ee13be5b00fbb3a1c4af89488f643eb17f7775a3f412402e46ac7fa030b3ac4');for(const asset of ['UI_1.swf','LevelsTut.swf','LevelsOMM.swf']){const res=await fetch(first.url+'p/cbp/'+asset);assert(res.ok,asset+' HTTP '+res.status+' '+(res.ok?'':await res.text()));assert((await res.arrayBuffer()).byteLength>1000);}await server.stop();assert(!fs.existsSync(path.join(world,'instance.lock')));await server.start();await server.stop();fs.writeFileSync(${JSON.stringify(path.join(out, 'receipt.json'))},JSON.stringify({ok:true,scope:'Actual packaged Singleplayer and child ASAR modules, real packaged server, Electron utility process, fresh isolated world, normal close/restart; no game/account/profile access'}));}finally{await server.stop();}app.quit();}).catch(e=>{fs.writeFileSync(${JSON.stringify(path.join(out, 'failure.txt'))},e.stack);app.exit(1);});`
  );
  const [directory] = await require('@electron/packager').packager({
    dir: source,
    name: 'PackagedWorldPipelineFixture',
    executableName: 'PackagedWorldPipelineFixture',
    platform: 'win32',
    arch: 'x64',
    electronVersion: require('../package.json').devDependencies.electron,
    out: path.join(out, 'package'),
    asar: true,
    prune: false,
    overwrite: false,
  });
  const resource = path.join(directory, 'resources'),
    exe = path.join(directory, 'PackagedWorldPipelineFixture.exe'),
    target = path.join(resource, 'verified-app.asar'),
    server = path.join(resource, 'runtime/singleplayer.asar');
  fs.copyFileSync(path.join(packaged, 'app.asar'), target);
  fs.mkdirSync(path.dirname(server), { recursive: true });
  fs.copyFileSync(path.join(packaged, 'runtime/singleplayer.asar'), server);
  fs.cpSync(path.join(packaged, 'runtime/singleplayer.asar.unpacked'), server + '.unpacked', {
    recursive: true,
  });
  require('./asar-integrity.cjs').register(exe, [path.join(resource, 'app.asar'), target, server]);
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
  require('./asar-integrity.cjs').verify(exe, [path.join(resource, 'app.asar'), target, server]);
  require('./asar-integrity-negative.cjs')(
    exe,
    out,
    path.join(root, '.test-tools/PrivateDesktop.exe')
  );
  const runner = path.join(out, 'run.cjs');
  fs.writeFileSync(
    runner,
    `require('child_process').execFileSync(${JSON.stringify(path.join(directory, 'PackagedWorldPipelineFixture.exe'))},[],{windowsHide:true,stdio:'inherit',timeout:55000});`
  );
  execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), [process.execPath, runner], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 60000,
  });
  const receipt = path.join(out, 'receipt.json');
  if (!fs.existsSync(receipt) || !JSON.parse(fs.readFileSync(receipt)).ok)
    throw Error(
      fs.existsSync(path.join(out, 'failure.txt'))
        ? fs.readFileSync(path.join(out, 'failure.txt'), 'utf8')
        : 'Packaged world did not complete'
    );
  console.log(
    'PASS production fuses, registered archive integrity and packaged singleplayer lifecycle: ' +
      out
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
