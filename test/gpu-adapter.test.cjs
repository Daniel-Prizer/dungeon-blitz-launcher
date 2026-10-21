'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {adaptGpuClient}=require('../src/gpu/client-adapter.cjs'),recipe=require('../src/gpu/adapter-20261020.json'),{modernAddress}=require('../src/modern-runtime.cjs');
test('GPU client admission keeps exact source, mutation inventory and preservation requirements',()=>{
 const file=path.join(__dirname,'../.test-tools/240hz-research/current.swf');assert(fs.existsSync(file),'Prepare the reviewed public fixture');const source=fs.readFileSync(file),output=adaptGpuClient(source,recipe);assert(output?.length>source.length);
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),recipe.sourceSha256);
 const changed=Buffer.from(source);changed[changed.length-1]^=1;assert.equal(adaptGpuClient(changed,recipe),null);
 for(const field of ['sourceSha256','writerSites','writerMethods','preservationVerified','contract']){const bad={...recipe,[field]:field==='preservationVerified'?false:null};assert.equal(adaptGpuClient(source,bad),null);}
 assert.equal(adaptGpuClient(Buffer.alloc(4*1024*1024+1),recipe),null);
});
test('GPU host selection cannot silently switch a custom or local server to multiplayer',()=>{
 for(const url of ['https://dungeonblitzr.theminesa.studio/','https://dungeonblitz.theminesa.studio/web'])assert.equal(modernAddress(url),'https://dungeonblitz.theminesa.studio/web');
 assert.equal(modernAddress('https://dungeonblitzr.theminesa.studio/web/?lang=en'),'https://dungeonblitz.theminesa.studio/web?lang=en');
 for(const url of ['http://localhost:8000/','https://example.com/','https://user:pass@dungeonblitz.theminesa.studio/','https://dungeonblitz.theminesa.studio:444/','https://dungeonblitz.theminesa.studio/rankings'])assert.equal(modernAddress(url),null);
});
test('October 21 GPU adapter preserves the upstream door-band refusal and its complete helper',()=>{
 const {readSWF}=require('../src/legacy/swf-contract.cjs'),bytes=fs.readFileSync(path.join(__dirname,'../.test-tools/gpu-current-oct21/current.swf')),current=require('../src/gpu/adapter.json'),output=adaptGpuClient(bytes,current);assert(output);
 const before=readSWF(bytes),after=readSWF(output),find=(swf,name)=>swf.tags.flatMap(t=>t.abc?.bodies||[]).find(b=>b.name===name);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'c0abc2eac96a102b3be0246e8d3b83342bfe29e45e2c0a62e1942a051b485294');
 assert.deepEqual(find(before,'Entity.method_1219').bytes,find(after,'Entity.method_1219').bytes);
 const helper=before.tags.find(t=>t.abc?.bodies.some(b=>b.name==='DoorTriggerBand.Refuse'));assert(helper);assert(after.tags.some(t=>t.raw.equals(helper.raw)));
 const old=readSWF(fs.readFileSync(path.join(__dirname,'../.test-tools/240hz-research/current.swf')));assert.deepEqual(find(before,'Entity.method_1219').code.subarray(14),find(old,'Entity.method_1219').code);
 assert.equal(adaptGpuClient(bytes,recipe),null);const changed=Buffer.from(bytes);changed[changed.length-1]^=1;assert.equal(adaptGpuClient(changed,current),null);
});
