'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),options={windowsHide:true,stdio:'inherit'};
try{
 execFileSync(process.execPath,[path.join(__dirname,'prepare-projector.cjs')],options);
 if(!fs.existsSync(path.join(root,'.test-tools/focus/ffdec/ffdec.jar')))throw Error('Install the existing test compiler first: node scripts/prepare-margin-fixture.cjs');
 const storage=process.argv.includes('--storage');
 execFileSync(process.execPath,[path.join(__dirname,'prepare-projector-probe.cjs'),...(storage?['--storage']:[])],options);
 try{execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),[process.execPath,path.join(__dirname,'projector-probe.cjs')],options);}finally{console.log(fs.readFileSync(path.join(root,'.test-tools/projector-probe/result.log'),'utf8'));}
 if(storage){const files=path.join(root,'.test-tools/projector-probe/profile');let found=false;function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='blitzSandboxFixture.sol')found=true;}}walk(files);if(!found)throw Error('Flash did not persist its synthetic save in the isolated profile');}
}catch(error){console.error(error.message);process.exitCode=1;}
