'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const {update}=require('../src/setup-update.cjs');
test('Setup installs latest signed release, refuses running games/invalid bootstrap, and repeats without rewriting a current build',async()=>{
 if(process.platform!=='win32')return;
 const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(root,'.test-tools/setup-update-unit-')),savedFetch=global.fetch;
 const installation=path.join(directory,'installed'),oldBuild=path.join(installation,'release/0.1.0/Dungeon Blitz Launcher-win32-x64'),allowed=path.join(oldBuild,'Dungeon Blitz Launcher.exe'),gameFile=path.join(oldBuild,'game-standin.exe'),helper=path.join(oldBuild,'resources/runtime/UpdateInstaller.exe');
 let bootstrap,game;
 try{
  fs.mkdirSync(path.dirname(helper),{recursive:true});fs.copyFileSync(path.join(root,'runtime/UpdateInstaller.exe'),helper);fs.writeFileSync(path.join(installation,'Dungeon Blitz Launcher.exe'),'old');fs.writeFileSync(path.join(installation,'notes.txt'),'preserve');
  const cs=path.join(directory,'fixture.cs');fs.writeFileSync(cs,'public static class Fixture{public static void Main(){System.Threading.Thread.Sleep(60000);}}');
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:winexe',`/out:${allowed}`,cs],{windowsHide:true});fs.copyFileSync(allowed,gameFile);
  bootstrap=spawn(allowed,[],{windowsHide:true,stdio:'ignore'});
  const version='9.9.9',source=path.join(directory,'source'),build=`release/${version}/Dungeon Blitz Launcher-win32-x64`,names=['Dungeon Blitz Launcher.exe',`${build}/Dungeon Blitz Launcher.exe`];
  const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
  for(const name of names){const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'new');}
  const zip=path.join(directory,'payload.zip');execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/zip-release.ps1'),source,zip],{windowsHide:true});const bytes=fs.readFileSync(zip);
  const manifest={schema:1,version,platform:'win32-x64',zip:{name:'Dungeon-Blitz-Launcher-9.9.9-win64.zip',size:bytes.length,sha256:hash(bytes)},files:names.map(name=>({path:name,size:3,sha256:hash('new')}))};
  const pair=crypto.generateKeyPairSync('ed25519'),payload=Buffer.from(JSON.stringify(manifest)),envelope={payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')};
  let requests=0;global.fetch=async url=>{requests++;return new Response(url.endsWith('/latest')?JSON.stringify({tag_name:'v9.9.9',assets:[{name:'Dungeon-Blitz-Launcher-9.9.9-update.json'}]}):url.endsWith('-update.json')?JSON.stringify(envelope):bytes);};
  const run=(cache,pid=bootstrap.pid,current='0.1.0')=>update({current,cache:path.join(directory,cache),installRoot:installation,helper,pid,publicKey:pair.publicKey});
  await assert.rejects(()=>run('outside',process.pid),/outside the installed build/);assert.equal(fs.readFileSync(path.join(installation,'Dungeon Blitz Launcher.exe'),'utf8'),'old');
  await assert.rejects(()=>run('zero',0),/Invalid setup update process/);
  game=spawn(gameFile,[],{windowsHide:true,stdio:'ignore'});await new Promise(resolve=>setTimeout(resolve,100));
  await assert.rejects(()=>run('busy'),/Close the installed Dungeon Blitz Launcher/);assert.equal(game.exitCode,null);assert.equal(fs.readFileSync(path.join(installation,'Dungeon Blitz Launcher.exe'),'utf8'),'old');
  await new Promise(resolve=>{game.once('exit',resolve);game.kill();});game=null;
  assert.deepEqual(await run('good'),{phase:'installed',version});assert.equal(fs.readFileSync(path.join(installation,'Dungeon Blitz Launcher.exe'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(installation,'Dungeon Blitz Launcher.previous.exe'),'utf8'),'old');assert.equal(bootstrap.exitCode,null);
  const before=fs.statSync(path.join(installation,'Dungeon Blitz Launcher.exe')).mtimeMs;requests=0;
  assert.deepEqual(await run('current',bootstrap.pid,version),{phase:'current',version});assert.equal(requests,1);assert.equal(fs.statSync(path.join(installation,'Dungeon Blitz Launcher.exe')).mtimeMs,before);assert(!fs.existsSync(path.join(directory,'current')));assert.equal(fs.readFileSync(path.join(installation,'notes.txt'),'utf8'),'preserve');
 }finally{
  global.fetch=savedFetch;for(const process of [game,bootstrap])if(process&&process.exitCode===null)await new Promise(resolve=>{process.once('exit',resolve);process.kill();});
  if(path.dirname(directory)===path.join(root,'.test-tools')&&path.basename(directory).startsWith('setup-update-unit-'))fs.rmSync(directory,{recursive:true,force:true});
 }
});
