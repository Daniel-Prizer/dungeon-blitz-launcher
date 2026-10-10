'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{execFile,spawn}=require('node:child_process');
const {REPO,newer,verifyManifest,releaseAsset,allowedDownload}=require('./update-policy.cjs');
async function response(url,signal,maxRedirects=4){
 if(!allowedDownload(url))throw Error('Update download origin rejected');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
 try{const res=await fetch(url,{redirect:'manual',signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal,headers:{'User-Agent':'DungeonBlitzLauncher-updates','Accept':'application/json'}});
  if(res.status>=300&&res.status<400){await res.body?.cancel();clearTimeout(timer);if(!maxRedirects)throw Error('Too many update redirects');return response(new URL(res.headers.get('location'),url).href,signal,maxRedirects-1);}
  if(!res.ok){await res.body?.cancel();throw Error(`GitHub update request failed (${res.status})`);}return {res,finish:()=>clearTimeout(timer)};
 }catch(e){clearTimeout(timer);throw e;}
}
async function json(url,limit,signal){const {res,finish}=await response(url,signal);try{const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>limit)throw Error('Update response too large');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{finish();}}
async function verifyFiles(root,manifest,signal){
 const expected=new Map(manifest.files.map(file=>[file.path,file]));let count=0;
 async function walk(relative=''){for(const entry of await fs.promises.readdir(path.join(root,relative),{withFileTypes:true})){signal?.throwIfAborted();const name=relative?relative+'/'+entry.name:entry.name,file=path.join(root,name);if(entry.isSymbolicLink())throw Error('Update links rejected');if(entry.isDirectory())await walk(name);else{const item=expected.get(name),stat=await fs.promises.lstat(file);if(!item||!stat.isFile()||stat.size!==item.size)throw Error('Extracted update mismatch');const hash=crypto.createHash('sha256');let size=0;for await(const chunk of fs.createReadStream(file)){signal?.throwIfAborted();size+=chunk.length;if(size>item.size)throw Error('Extracted update grew during verification');hash.update(chunk);}if(size!==item.size||hash.digest('hex')!==item.sha256)throw Error('Extracted update mismatch');count++;}}}
 await walk();if(count!==manifest.files.length)throw Error('Incomplete extracted update');
}
class Updater extends EventEmitter {
 constructor({current,cache,installRoot,helper,enabled=true,publicKey,waitPids=()=>[]}){super();this.current=current;this.cache=cache;this.installRoot=installRoot;this.helper=helper;this.enabled=enabled;this.waitPids=waitPids;this.publicKey=publicKey||fs.readFileSync(path.join(__dirname,'update-key.pem'));this.status={phase:'idle',version:'',percent:0,error:''};this.busy=false;}
 publish(patch){Object.assign(this.status,patch);this.emit('state');}
 start(){this.stop(false);if(this.enabled){this.first=setTimeout(()=>void this.check(),10000);this.first.unref();this.timer=setInterval(()=>void this.check(),6*60*60*1000);this.timer.unref();}}
 stop(cancel=true){clearTimeout(this.first);clearInterval(this.timer);if(cancel)this.controller?.abort();}
 async check(){if(this.busy||this.status.phase==='ready')return;this.busy=true;this.controller=new AbortController();const signal=this.controller.signal;this.publish({phase:'checking',error:''});
  try{const release=await json(`https://api.github.com/repos/${REPO}/releases/latest`,2000000,signal);if(release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('Invalid GitHub release');const next=release.tag_name.slice(1);
   if(!newer(next,this.current)){this.publish({phase:'current'});return;}
   const name=`Dungeon-Blitz-Launcher-${next}-update.json`;if(!release.assets?.some(asset=>asset.name===name))throw Error('Latest release has no signed update; use its manual download');
   const manifest=verifyManifest(await json(releaseAsset(next,name),6000000,signal),this.publicKey,this.current);if(manifest.version!==next)throw Error('Release and manifest disagree');
   await new Promise((resolve,reject)=>execFile(this.helper,['preflight',this.installRoot],{windowsHide:true,timeout:10000},error=>error?reject(Error('Installation folder is not writable. Move the complete launcher folder to Downloads for automatic updates.')):resolve()));
   fs.mkdirSync(this.cache,{recursive:true});const dir=fs.mkdtempSync(path.join(this.cache,'stage-'));this.stage=dir;const archive=path.join(dir,'payload.zip');
   await new Promise((resolve,reject)=>execFile(this.helper,['protect',dir],{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));
   this.publish({phase:'downloading',version:next,percent:0});const {res,finish}=await response(releaseAsset(next,manifest.zip.name),signal);const file=fs.openSync(archive,'wx');let size=0;const hash=crypto.createHash('sha256');
   try{for await(const chunk of res.body){size+=chunk.length;if(size>manifest.zip.size)throw Error('Update archive exceeded signed size');fs.writeSync(file,chunk);hash.update(chunk);this.publish({percent:Math.floor(size/manifest.zip.size*100)});}}finally{fs.closeSync(file);finish();}
   if(size!==manifest.zip.size||hash.digest('hex')!==manifest.zip.sha256)throw Error('Update archive hash mismatch');
   this.publish({phase:'verifying'});const extracted=path.join(dir,'files');
   await new Promise((resolve,reject)=>execFile(this.helper,['extract',archive,extracted],{windowsHide:true,timeout:120000},error=>error?reject(error):resolve()));signal.throwIfAborted();await verifyFiles(extracted,manifest,signal);
   fs.writeFileSync(path.join(dir,'install.json'),JSON.stringify({version:next,source:extracted,destination:this.installRoot,pid:process.pid,files:manifest.files}));this.publish({phase:'ready',percent:100});
  }catch(error){const stage=this.stage;this.stage=null;if(stage&&path.dirname(path.resolve(stage))===path.resolve(this.cache)&&/^stage-[A-Za-z0-9]+$/.test(path.basename(stage))){try{await fs.promises.rm(stage,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}this.publish({phase:signal.aborted?'idle':'error',error:signal.aborted?'':String(error.message).slice(0,200)});}finally{this.busy=false;this.controller=null;}
 }
 installAfterExit(restart=false){if(this.status.phase!=='ready')return false;try{const configPath=path.join(this.stage,'install.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));config.pids=[...new Set([process.pid,...this.waitPids()].filter(pid=>Number.isInteger(pid)&&pid>0&&pid<=2147483647))];fs.writeFileSync(configPath,JSON.stringify(config));const helper=path.join(this.stage,'UpdateInstaller.exe');fs.copyFileSync(this.helper,helper);const child=spawn(helper,['install',configPath,restart?'restart':'close'],{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',error=>this.publish({phase:'error',error:String(error.message).slice(0,200)}));child.unref();return true;}catch(error){this.publish({phase:'error',error:String(error.message).slice(0,200)});return false;}}
}
module.exports={Updater,verifyFiles};
