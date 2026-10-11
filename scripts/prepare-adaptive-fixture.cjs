'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/audio-adaptive'),source=path.join(root,'.test-tools/focus/deployed.swf'),deployment=require('../src/legacy/client-deployment.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(source)){const response=await fetch(deployment.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Game HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==deployment.inputHash)throw Error('Live deployment changed; review test provenance');fs.writeFileSync(source,bytes);}
 const input=fs.readFileSync(source);if(hash(input)!==deployment.inputHash)throw Error('Fixture provenance mismatch');
 const recipe=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract.json'))),output=require('../src/legacy/adaptive-patch.cjs').patchAdaptiveClient(input,recipe);if(!output)throw Error('Current deployment does not match reviewed hook contracts');
 const stamp=hash(Buffer.concat([output,fs.readFileSync(path.join(root,'test/audio-fixture/DungeonBlitz.as')),fs.readFileSync(path.join(root,'test/fps-fixture/DungeonBlitz.as'))])),stampFile=path.join(dir,'build-stamp');
 if(fs.existsSync(stampFile)&&fs.readFileSync(stampFile,'utf8')===stamp&&['audio.swf','fixture.swf','fps-fixture.swf'].every(file=>fs.existsSync(path.join(dir,file))))return;
 fs.writeFileSync(path.join(dir,'audio.swf'),output);
 for(const [fixture,file] of [['audio-fixture','fixture.swf'],['fps-fixture','fps-fixture.swf']])execFileSync('java',['-Djava.awt.headless=true','-jar',path.join(root,'.test-tools/focus/ffdec/ffdec.jar'),'-importScript',path.join(dir,'audio.swf'),path.join(dir,file),path.join(root,'test',fixture)],{windowsHide:true,stdio:'inherit'});
 fs.writeFileSync(stampFile,stamp);console.log('Prepared current deployment using the previous reviewed reusable hooks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
