'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
const disk=process.versions.electron?require('original-fs'):fs;
const {Updater}=require('./updater.cjs'),{installationRoot}=require('./update-policy.cjs');
async function update({current,cache,installRoot,helper,pid=process.pid,publicKey}){
 const updater=new Updater({current,cache,installRoot,helper,enabled:false,publicKey});await updater.check();
 if(updater.status.phase==='current')return {phase:'current',version:current};
 if(updater.status.phase!=='ready')throw Error(updater.status.error||'Setup could not verify the latest update');
 // The native helper permits only this windowless installed process. Any game
 // or other installed process blocks installation; it is never terminated.
 await promisify(execFile)(helper,['install-bootstrap',path.join(updater.stage,'install.json'),String(pid)],{windowsHide:true,timeout:120000});
 return {phase:'installed',version:updater.status.version};
}
async function run(app){
 let directory,code=1;
 try{
  if(!app.isPackaged)throw Error('Setup update mode requires an installed packaged launcher');
  const current=app.getVersion(),installRoot=installationRoot(process.execPath,current);if(!installRoot)throw Error('Invalid installed launcher layout');
  directory=disk.mkdtempSync(path.join(os.tmpdir(),'blitz-setup-update-'));app.setPath('userData',path.join(directory,'profile'));app.disableHardwareAcceleration();app.enableSandbox();await app.whenReady();
  const result=await update({current,installRoot,cache:path.join(directory,'updates'),helper:path.join(process.resourcesPath,'runtime/UpdateInstaller.exe')});console.log(JSON.stringify(result));code=0;
 }catch(error){console.error('Setup update:',error.message);}
 finally{
  if(directory&&path.dirname(directory)===os.tmpdir()&&/^blitz-setup-update-[A-Za-z0-9]+$/.test(path.basename(directory)))try{await disk.promises.rm(directory,{recursive:true,force:true,maxRetries:2,retryDelay:100});}catch{}
  app.exit(code);
 }
}
module.exports={run,update};
