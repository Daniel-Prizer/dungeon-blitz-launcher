'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'runtime/projector'),file=path.join(dir,'flashplayer_32_sa.exe');
const expected='a4b333ac1da12026989549015303d82231982838bccfb544ba5fd188746066f0';
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(file)){
  const response=await fetch('https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.exe',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Adobe projector download unavailable');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>30000000)throw Error('Projector download too large');chunks.push(Buffer.from(chunk));}const bytes=Buffer.concat(chunks);if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Adobe projector hash differs from the reviewed binary');fs.writeFileSync(file,bytes,{flag:'wx'});
 }
 if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Projector integrity verification failed');
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64','/r:System.Web.Extensions.dll',`/out:${path.join(root,'runtime/SandboxHost.exe')}`,path.join(root,'src/SandboxHost.cs')],{windowsHide:true,stdio:'inherit'});
 fs.mkdirSync(path.join(root,'.test-tools'),{recursive:true});
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${path.join(root,'.test-tools/PrivateDesktop.exe')}`,path.join(root,'scripts/PrivateDesktop.cs')],{windowsHide:true,stdio:'inherit'});
 console.log('Verified Adobe projector 32.0.0.465; prepared the unshipped AppContainer prototype.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
