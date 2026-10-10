'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tools=path.join(root,'.test-tools'),folder=path.join(tools,'inno-7.1.0');
const hash='0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f';
async function prepare(){
 fs.mkdirSync(tools,{recursive:true});
 const installer=path.join(tools,'innosetup-7.1.0-x64.exe');
 if(!fs.existsSync(installer)){
  const response=await fetch('https://github.com/jrsoftware/issrc/releases/download/is-7_1_0/innosetup-7.1.0-x64.exe',{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Inno compiler download failed');
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>30000000||crypto.createHash('sha256').update(data).digest('hex')!==hash)throw Error('Inno compiler hash mismatch');
  fs.writeFileSync(installer,data);
 }
 if(crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex')!==hash)throw Error('Inno compiler hash mismatch');
 execFileSync('pwsh.exe',['-NoProfile','-File',path.join(__dirname,'verify-inno.ps1'),installer],{stdio:'inherit',windowsHide:true});
 if(!fs.existsSync(path.join(folder,'ISCC.exe'))){
  const desktop=path.join(tools,'PrivateDesktop.exe');
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${desktop}`,path.join(__dirname,'PrivateDesktop.cs')],{windowsHide:true,stdio:'inherit'});
  execFileSync(desktop,[process.execPath,path.join(__dirname,'install-inno.cjs')],{windowsHide:true,stdio:'inherit',timeout:180000});
 }
 return path.join(folder,'ISCC.exe');
}
module.exports=prepare;
if(require.main===module)prepare().then(value=>console.log(value)).catch(error=>{console.error(error.message);process.exitCode=1;});
