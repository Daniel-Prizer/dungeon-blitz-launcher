'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
(async()=>{
 let probe;
 if(process.argv.includes('--isolated-fixture')){const fixture=JSON.parse(fs.readFileSync(path.join(root,'.test-tools/pipeline-fixture.json')));process.env.BLITZ_UPDATER_TEST_CONFIG=fixture.config;probe=fixture.executable;}
 const result=await require('./installer.cjs')({test:true,probe});
 fs.writeFileSync(path.join(root,'.test-tools/installer-test-config.json'),JSON.stringify(result));
 const helper=path.join(root,'.test-tools/PrivateDesktop.exe');
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${helper}`,path.join(__dirname,'PrivateDesktop.cs')],{windowsHide:true});
 try{execFileSync(helper,[process.execPath,path.join(__dirname,'installer-test.cjs')],{windowsHide:true,stdio:'inherit',timeout:245000});}
 finally{const log=path.join(root,'.test-tools/installer-test.log');if(fs.existsSync(log))process.stdout.write(fs.readFileSync(log));}
})().catch(error=>{console.error(error);process.exitCode=1;});
