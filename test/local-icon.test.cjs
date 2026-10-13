'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {patchLocalIcons,localIconAsset}=require('../src/legacy/local-icon-patch.cjs'),{readSWF}=require('../src/legacy/swf-contract.cjs'),recipe=require('../src/legacy/local-icon-fallback.json');
const root=path.resolve(__dirname,'..'),files=['.test-tools/hotbar-diagnosis/assets/UI_1.swf','.test-tools/singleplayer-assets/UI_1.swf'];
const present=files.every(f=>fs.existsSync(path.join(root,f))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('local icon repair ships only two launcher-owned presentation aliases',()=>{
 assert.equal(recipe.format,1);assert.equal(recipe.sources.length,2);
 assert.deepEqual(recipe.helpers.map(h=>[h.name,h.fallback]),[['a_PowerIcon_MeteorROR','a_PowerIcon_Meteor'],['a_PowerIcon_CrimsonShot','a_PowerIcon_FireBall']]);
 for(const helper of recipe.helpers){const bytes=Buffer.from(helper.data,'base64');assert.equal(hash(bytes),helper.hash);assert(bytes.length<8192);assert(!bytes.includes(Buffer.from('ExternalInterface')));assert(!bytes.includes(Buffer.from('URLRequest')));}
});
test('repair is scoped to one UI asset at the exact selected local origin',()=>{
 const address='http://localhost:8000/',request=address+'p/cbp/UI_1.swf?v=cbp';assert(localIconAsset(address,request));
 for(const url of ['http://localhost:8001/p/cbp/UI_1.swf','http://localhost:8000/p/cbp/Game.swz','http://localhost:8000/p/cbp/DungeonBlitz.swf','https://example.com/UI_1.swf','invalid'])assert(!localIconAsset(address,url));
 const remote='https://dungeonblitzr.theminesa.studio/';assert(!localIconAsset(remote,remote+'p/cbp/UI_1.swf'));
});
test('reviewed local UI assets retain every original method, graphic, binding and frame',{skip:!present},()=>{
 for(const file of files){const input=fs.readFileSync(path.join(root,file));assert(recipe.sources.includes(hash(input)));const patched=patchLocalIcons(input,'http://localhost:8000/');assert(patched);
  const before=readSWF(input),after=readSWF(patched);assert(before.preamble.equals(after.preamble));assert.equal(after.tags.length,before.tags.length+2);
  const kept=after.tags.filter(t=>!recipe.helpers.some(h=>hash(t.raw)===h.hash));assert.deepEqual(kept.map(t=>t.raw),before.tags.map(t=>t.raw),'Native tags stay in original order, byte-identical');
  for(const helper of recipe.helpers)assert(after.tags.some(t=>hash(t.raw)===helper.hash));
  assert.equal(patchLocalIcons(patched,'http://localhost:8000/'),null,'Idempotent; never duplicate/override an existing alias');
  const knownExisting={...recipe,sources:[...recipe.sources,hash(patched)]};assert.equal(patchLocalIcons(patched,'http://localhost:8000/',knownExisting),null,'Existing definitions still reject even with a matching reviewed source hash');
 }
});
test('remote origins, changed assets and damaged/reordered helpers cannot enable the repair',{skip:!present},()=>{
 const input=fs.readFileSync(path.join(root,files[0]));
 for(const address of ['https://dungeonblitzr.theminesa.studio/','https://dungeonblitz.theminesa.studio/','https://localhost:8000/','http://example.com/','http://user:password@localhost:8000/','file:///UI_1.swf','invalid'])assert.equal(patchLocalIcons(input,address),null);
 for(const address of ['http://localhost:8000/','http://127.0.0.1:8000/','http://[::1]:8000/'])assert(patchLocalIcons(input,address));
 const changed=Buffer.from(input);changed[100]^=1;assert.equal(patchLocalIcons(changed,'http://localhost:8000/'),null);
 for(const edit of [r=>r.helpers.reverse(),r=>r.helpers[0].data='AAAA',r=>r.helpers[1].fallback='a_PowerIcon_DoubleStrike',r=>r.sources=[]]){const copy=JSON.parse(JSON.stringify(recipe));edit(copy);assert.equal(patchLocalIcons(input,'http://localhost:8000/',copy),null);}
});
