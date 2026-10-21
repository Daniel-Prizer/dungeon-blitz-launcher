'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {publicBytes}=require('../src/modern-runtime.cjs'),{adaptGpuClient}=require('../src/gpu/client-adapter.cjs'),{adaptClient}=require('../src/legacy/client-adapter.cjs');
const root=path.resolve(__dirname,'..'),stage=JSON.parse(fs.readFileSync(path.join(root,'.test-tools/release-stage.json'))).stage,recipe=require('../src/gpu/adapter.json'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const contract=JSON.parse(fs.readFileSync(path.join(stage,'runtime/game/resources/adaptive-contract-backdrop-oct19.json'))),publicChecks=[];
 for(const origin of ['https://dungeonblitzr.theminesa.studio/','https://dungeonblitz.theminesa.studio/']){
  const html=(await publicBytes(origin,1024*1024)).toString('utf8'),match=html.match(/\/p\/[a-z]{3}\/DungeonBlitz\.swf\?[^\s"'<>`$]+/);if(!match)throw Error('Public main reference changed');
  const url=new URL(match[0].replaceAll('&amp;','&'),origin).href,bytes=await publicBytes(url,4*1024*1024),native=adaptClient(bytes,origin,{multiplayer:[contract]});
  if(native.mode!=='contract'||!native.audio||!adaptGpuClient(bytes,recipe))throw Error('A reviewed launcher adapter rejected the current deployment');
  publicChecks.push({origin,url,sha256:hash(bytes),bytes:bytes.length,original:native.mode,gpu:true});
 }
 const record={checkedAt:new Date().toISOString(),publicChecks,assetContract:hash(fs.readFileSync(path.join(root,'src/gpu/assets.json'))),runtimeContract:hash(fs.readFileSync(path.join(root,'src/gpu/runtime.json')))};
 fs.writeFileSync(path.join(root,'.test-tools/release-compatibility.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
