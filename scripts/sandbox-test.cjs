'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.env.BLITZ_PRIVATE_DESKTOP)throw Error('Inactive desktop required');
execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
const dir=path.join(root,'.test-tools/sandbox-probe-runtime');fs.mkdirSync(dir,{recursive:true});
execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64','/r:System.Web.Extensions.dll',`/out:${path.join(dir,'flashplayer_32_sa.exe')}`,path.join(root,'test/SandboxProbe.cs')],{windowsHide:true});
const canary=path.join(root,'.test-tools/sandbox-private-canary.txt');fs.writeFileSync(canary,'Synthetic private data; no user files involved.');
const probe=path.join(dir,'probe.json');fs.writeFileSync(probe,JSON.stringify({canary}));
const config=path.join(dir,'launch.json');fs.writeFileSync(config,JSON.stringify({executable:path.join(dir,'flashplayer_32_sa.exe'),content:probe,profile:'Blitz.Projector.SecurityTest',dataDirectory:dir,internet:false,probe:true}));
let contacted=false;const server=http.createServer((_req,res)=>{contacted=true;res.end('probe');});
server.listen(47699,'127.0.0.1',()=>{
 const child=spawn(path.join(root,'runtime/SandboxHost.exe'),[config],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 const timer=setTimeout(()=>child.stdin.end(),12000);const log=path.join(dir,'test.log');fs.writeFileSync(log,'');child.stderr.on('data',d=>fs.appendFileSync(log,d));
 child.on('exit',code=>{clearTimeout(timer);server.close();try{assert.equal(code,0);const result=JSON.parse(fs.readFileSync(path.join(dir,'result.json')));for(const key of ['appContainer','readBlocked','writeBlocked','childBlocked','networkBlocked'])assert.equal(result[key],true,key);assert.equal(contacted,false);assert.equal(fs.readFileSync(canary,'utf8'),'Synthetic private data; no user files involved.');fs.writeFileSync(log,'PASS actual AppContainer token, private-file read/write denial, child-process denial and loopback denial\n'+JSON.stringify(result));}catch(e){fs.appendFileSync(log,e.stack);process.exitCode=1;}});
});
