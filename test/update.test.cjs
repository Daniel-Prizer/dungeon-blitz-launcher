'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {verifyManifest,safePath,newer,allowedDownload,installationRoot}=require('../src/update-policy.cjs');
const {verifyFiles,Updater}=require('../src/updater.cjs');
const pair=crypto.generateKeyPairSync('ed25519');
const manifest=()=>({schema:1,platform:'win32-x64',version:'0.10.0',zip:{name:'Dungeon-Blitz-Launcher-0.10.0-win64.zip',size:10,sha256:'a'.repeat(64)},files:[{path:'Dungeon Blitz Launcher.exe',size:3,sha256:crypto.createHash('sha256').update('new').digest('hex')},{path:'release/0.10.0/Dungeon Blitz Launcher-win32-x64/Dungeon Blitz Launcher.exe',size:3,sha256:crypto.createHash('sha256').update('new').digest('hex')}]});
function sign(value){const bytes=Buffer.from(JSON.stringify(value));return {payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,pair.privateKey).toString('base64')};}
test('signed updates reject tampering, wrong signer, rollback and wrong platform',()=>{
 assert.equal(verifyManifest(sign(manifest()),pair.publicKey,'0.9.0').version,'0.10.0');
 const changed=sign(manifest());changed.payload=Buffer.from(changed.payload,'base64').toString().replace('0.10.0','0.11.0');assert.throws(()=>verifyManifest(changed,pair.publicKey,'0.9.0'));
 assert.throws(()=>verifyManifest(sign(manifest()),crypto.generateKeyPairSync('ed25519').publicKey,'0.9.0'));
 assert.throws(()=>verifyManifest(sign(manifest()),pair.publicKey,'0.10.0'));
 assert.throws(()=>verifyManifest(sign({...manifest(),platform:'linux'}),pair.publicKey,'0.9.0'));
 for(const bad of ['../outside','C:/secret','release/../outside','release\\outside','/outside','release/CON.exe','release/a.','release/a '])assert.equal(safePath(bad),false,bad);
 for(const bad of ['../outside','Dungeon Blitz Launcher.exe:secret']){const value=manifest();value.files[0].path=bad;assert.throws(()=>verifyManifest(sign(value),pair.publicKey,'0.9.0'));}
 const duplicate=manifest();duplicate.files.push({...duplicate.files[0],path:duplicate.files[0].path.toUpperCase()});assert.throws(()=>verifyManifest(sign(duplicate),pair.publicKey,'0.9.0'));
 assert(newer('0.10.0','0.9.99'));assert(!newer('0.9.99','0.10.0'));
 const root=path.resolve('portable-test');assert.equal(installationRoot(path.join(root,'release/0.10.0/Dungeon Blitz Launcher-win32-x64/Dungeon Blitz Launcher.exe'),'0.10.0'),root);assert.equal(installationRoot(path.join(root,'Dungeon Blitz Launcher.exe'),'0.10.0'),null);
 for(const bad of ['http://github.com/x','https://github.com:8000/x','https://github.com.evil/x','https://user:pass@github.com/x','file:///x'])assert.equal(allowedDownload(bad),false);
});
test('complete signed download pipeline stages exact files, rejects corruption/redirects and cancels cleanly',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-updater-pipeline-')),savedFetch=global.fetch;
 const helper=path.resolve(__dirname,'../runtime/UpdateInstaller.exe'),value=manifest(),source=path.join(dir,'source'),zip=path.join(dir,'payload.zip');
 try{
  for(const item of value.files){const target=path.join(source,item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'new');}
  execFileSync('powershell.exe',['-NoProfile','-File',path.resolve(__dirname,'../scripts/zip-release.ps1'),source,zip],{windowsHide:true});
  const bytes=fs.readFileSync(zip);value.zip.size=bytes.length;value.zip.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const envelope=sign(value),requests=[];
  fs.mkdirSync(path.join(dir,'destination'));
  function responses(corrupt=false){return async url=>{requests.push(url);if(url.endsWith('/latest'))return new Response(JSON.stringify({tag_name:'v0.10.0',assets:[{name:'Dungeon-Blitz-Launcher-0.10.0-update.json'}]}));if(url.endsWith('-update.json'))return new Response(JSON.stringify(envelope));return new Response(corrupt?Buffer.alloc(bytes.length):bytes);};}
  const make=cache=>new Updater({current:'0.9.0',cache:path.join(dir,cache),installRoot:path.join(dir,'destination'),helper,publicKey:pair.publicKey});
  global.fetch=responses();const updater=make('good');await updater.check();assert.equal(updater.status.phase,'ready');assert.equal(requests.length,3);await verifyFiles(path.join(updater.stage,'files'),value);assert.equal(fs.readdirSync(path.join(dir,'destination')).length,0,'Checking must not replace or execute a build');
  global.fetch=responses(true);const corrupt=make('corrupt');await corrupt.check();assert.equal(corrupt.status.phase,'error');assert.match(corrupt.status.error,/hash mismatch/);assert.equal(corrupt.stage,null);
  global.fetch=async()=>new Response(null,{status:302,headers:{location:'https://attacker.invalid/payload'}});const redirected=make('redirect');await redirected.check();assert.equal(redirected.status.phase,'error');assert.match(redirected.status.error,/origin rejected/);
  global.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));const cancelled=make('cancelled');const pending=cancelled.check();cancelled.stop();await pending;assert.equal(cancelled.status.phase,'idle');assert.equal(cancelled.busy,false);
 }finally{global.fetch=savedFetch;fs.rmSync(dir,{recursive:true,force:true});}
});
test('verified extraction rejects altered, missing and extra files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-update-test-'));const value=manifest();
 try{for(const item of value.files){const name=path.join(dir,item.path);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,'new');}await verifyFiles(dir,value);
  fs.writeFileSync(path.join(dir,'extra'),'x');await assert.rejects(()=>verifyFiles(dir,value));fs.unlinkSync(path.join(dir,'extra'));
  fs.writeFileSync(path.join(dir,value.files[0].path),'bad');await assert.rejects(()=>verifyFiles(dir,value));fs.unlinkSync(path.join(dir,value.files[0].path));await assert.rejects(()=>verifyFiles(dir,value));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native extraction rejects Zip Slip and installer waits for game exit before atomic replacement',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-native-update-test-'));const helper=path.resolve(__dirname,'../runtime/UpdateInstaller.exe');
 try{
  const script=path.join(dir,'zip.ps1');fs.writeFileSync(script,"param($Zip)\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n$z=[IO.Compression.ZipFile]::Open($Zip,'Create')\n$e=$z.CreateEntry('../escape.txt')\n$s=New-Object IO.StreamWriter($e.Open())\n$s.Write('escape')\n$s.Dispose()\n$z.Dispose()\n");
  const zip=path.join(dir,'bad.zip');execFileSync('powershell.exe',['-NoProfile','-File',script,zip],{windowsHide:true});assert.throws(()=>execFileSync(helper,['extract',zip,path.join(dir,'extracted')],{windowsHide:true,stdio:'pipe'}));assert(!fs.existsSync(path.join(dir,'escape.txt')));
  const source=path.join(dir,'source'),destination=path.join(dir,'installed');fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,'Dungeon Blitz Launcher.exe'),'old');const value=manifest();
  for(const item of value.files){const name=path.join(source,item.path);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,'new');}
  const standIn=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  try{
   const config=path.join(dir,'install.json');fs.writeFileSync(config,JSON.stringify({version:value.version,source,destination,pid:2147483647,pids:[2147483647,standIn.pid],files:value.files}));
   const installing=require('node:util').promisify(require('node:child_process').execFile)(helper,['install',config,'close'],{windowsHide:true,timeout:10000});
   await new Promise(resolve=>setTimeout(resolve,150));assert.equal(fs.readFileSync(path.join(destination,'Dungeon Blitz Launcher.exe'),'utf8'),'old','Installer must wait for the game stand-in');standIn.kill();await installing;
   assert.equal(fs.readFileSync(path.join(destination,'Dungeon Blitz Launcher.exe'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(destination,'Dungeon Blitz Launcher.previous.exe'),'utf8'),'old');assert.equal(fs.readFileSync(path.join(destination,value.files[1].path),'utf8'),'new');
  }finally{if(standIn.exitCode===null)standIn.kill();}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
