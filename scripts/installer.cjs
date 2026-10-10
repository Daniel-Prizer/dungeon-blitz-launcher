'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const identity='{A9EAA7C2-5CDD-4C8F-B87E-EF061C6B2D72}';
async function build({test=false}={}){
 const compiler=await require('./prepare-inno.cjs')();
 const output=path.join(root,'release',version),build=path.join(output,'Dungeon Blitz Launcher-win32-x64');
 if(!fs.existsSync(path.join(build,'Dungeon Blitz Launcher.exe')))throw Error('Run npm run package first');
 execFileSync(path.join(root,'Dungeon Blitz Launcher.exe'),['--verify'],{windowsHide:true});
 const tools=path.join(root,'.test-tools'),maintenance=path.join(tools,'maintenance.exe');
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${maintenance}`,path.join(root,'src/InstallMaintenance.cs')],{windowsHide:true,stdio:'inherit'});
 const files=['Dungeon Blitz Launcher.exe'];
 function walk(folder){for(const item of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){const name=folder+'/'+item.name;if(item.isSymbolicLink())throw Error('Installer source contains a link');if(item.isDirectory())walk(name);else files.push(name);}}
 walk(`release/${version}/Dungeon Blitz Launcher-win32-x64`);
 const ledger=path.join(tools,'installer-files.txt');fs.writeFileSync(ledger,files.join('\r\n')+'\r\n');
 const appId=test?'{'+crypto.randomUUID().toUpperCase()+'}':identity,identityFile=path.join(tools,'installer-app-id.txt');fs.writeFileSync(identityFile,appId+'\r\n');
 const outputName=`Dungeon-Blitz-Launcher-${version}-Setup${test?'-test':''}`;
 execFileSync(compiler,['/Qp',...(test?['/DTestBuild=1']:[]),`/DSourceRoot=${root}`,`/DAppVersion=${version}`,`/DAppIdentity=${appId}`,`/DOutputFolder=${output}`,`/DOutputName=${outputName}`,`/DMaintenance=${maintenance}`,`/DLedger=${ledger}`,`/DIdentityFile=${identityFile}`,path.join(__dirname,'installer.iss')],{windowsHide:true,stdio:'inherit',timeout:180000});
 const setup=path.join(output,outputName+'.exe');
 if(!test){fs.copyFileSync(setup,path.join(root,'Dungeon Blitz Launcher Setup.exe'));const hash=crypto.createHash('sha256').update(fs.readFileSync(setup)).digest('hex');fs.writeFileSync(setup+'.sha256',hash+'  '+path.basename(setup)+'\n');}
 return {setup,appId,files};
}
module.exports=build;
if(require.main===module)build().then(result=>console.log('Single EXE installer: '+result.setup)).catch(error=>{console.error(error);process.exitCode=1;});
