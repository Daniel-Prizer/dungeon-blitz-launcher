'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {adaptGpuClient}=require('../src/gpu/client-adapter.cjs'),recipe=require('../src/gpu/adapter.json'),{modernAddress}=require('../src/modern-runtime.cjs');
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
