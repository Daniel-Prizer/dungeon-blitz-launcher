'use strict';
const {app}=require('electron'),disk=require('original-fs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
const config=JSON.parse(disk.readFileSync(process.env.BLITZ_UPDATER_TEST_CONFIG,'utf8')),record={version:require('../package.json').version,electron:process.versions.electron,passed:false,checks:[]};
app.setPath('userData',path.join(config.directory,'profile'));app.enableSandbox();
function finish(error){if(error)record.error=String(error.stack||error);else record.passed=true;disk.writeFileSync(path.join(config.directory,'result.json'),JSON.stringify(record,null,2));app.exit(error?1:0);}
const deadline=setTimeout(()=>finish(Error('Electron updater did not complete within 15 seconds')),15000);
app.whenReady().then(async()=>{
 const {Updater,verifyFiles}=require(config.module),destination=path.join(config.directory,'installation');disk.mkdirSync(destination);
 assert(fs.statSync(path.join(config.source,config.manifest.files[2].path)).isDirectory(),'Fixture must exercise Electron ASAR virtualization');
 const progress=[];await verifyFiles(config.source,config.manifest,undefined,(count,total)=>progress.push([count,total]));assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);record.checks.push('Actual Electron verifies the physical ASAR bytes without walking its virtual contents and reports progress');
 const make=cache=>new Updater({current:'0.1.0',cache:path.join(config.directory,cache),installRoot:destination,helper:config.helper,publicKey:config.publicKey});
 const pinned=new Updater({current:'0.1.0',cache:'unused',installRoot:destination,helper:config.helper});assert.match(pinned.publicKey.toString(),/BEGIN PUBLIC KEY/);record.checks.push('Default pinned key remains readable from the trusted application bundle');
 global.fetch=async url=>new Response(url.endsWith('/latest')?JSON.stringify({tag_name:'v9.9.9',assets:[{name:'Dungeon-Blitz-Launcher-9.9.9-update.json'}]}):url.endsWith('-update.json')?JSON.stringify(config.envelope):disk.readFileSync(config.zip));
 const updater=make('valid');await updater.check();assert.equal(updater.status.phase,'ready',updater.status.error);await verifyFiles(path.join(updater.stage,'files'),config.manifest);record.checks.push('Signed download/extract/verify reaches ready under Electron');
 const asar=path.join(config.source,config.manifest.files[2].path),original=disk.readFileSync(asar),altered=Buffer.from(original);altered[altered.length-1]^=1;disk.writeFileSync(asar,altered);await assert.rejects(()=>verifyFiles(config.source,config.manifest));disk.writeFileSync(asar,original);record.checks.push('Changed physical ASAR bytes are rejected');
 disk.writeFileSync(path.join(config.source,'unexpected.txt'),'x');await assert.rejects(()=>verifyFiles(config.source,config.manifest));disk.unlinkSync(path.join(config.source,'unexpected.txt'));
 const rejected=make('rejected'),badManifest={...config.manifest,files:config.manifest.files.map((file,index)=>index===2?{...file,sha256:'0'.repeat(64)}:file)};
 // A correctly signed but wrong extracted file hash must fail and remove the
 // whole physical stage, including app.asar. Use a fresh fixture signing key.
 const crypto=require('node:crypto'),pair=crypto.generateKeyPairSync('ed25519'),payload=Buffer.from(JSON.stringify(badManifest));rejected.publicKey=pair.publicKey;
 const envelope={payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')};
 global.fetch=async url=>new Response(url.endsWith('/latest')?JSON.stringify({tag_name:'v9.9.9',assets:[{name:'Dungeon-Blitz-Launcher-9.9.9-update.json'}]}):url.endsWith('-update.json')?JSON.stringify(envelope):disk.readFileSync(config.zip));
 await rejected.check();assert.equal(rejected.status.phase,'error');assert.equal(rejected.stage,null);assert.deepEqual(disk.readdirSync(rejected.cache),[]);record.checks.push('Verification failure reports error and removes physical ASAR stage');
 clearTimeout(deadline);finish();
}).catch(error=>{clearTimeout(deadline);finish(error);});
