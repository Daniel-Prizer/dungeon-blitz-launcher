'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readSWF,writeSWF,encodeTag}=require('../src/legacy/swf-contract.cjs'),{adaptClient,localAddress}=require('../src/legacy/client-adapter.cjs');
const root=path.resolve(__dirname,'..'),files=['.test-tools/focus/singleplayer.swf','.test-tools/audio-singleplayer/audio.swf','runtime/game/resources/adaptive-contract-singleplayer.json','runtime/game/resources/adaptive-contract.json','.test-tools/focus/deployed-e547f078b555.swf'];
const present=files.every(f=>fs.existsSync(path.join(root,f))),main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
const load=()=>({input:fs.readFileSync(path.join(root,files[0])),compiled:readSWF(fs.readFileSync(path.join(root,files[1]))),recipes:{singleplayer:JSON.parse(fs.readFileSync(path.join(root,files[2]))),multiplayer:JSON.parse(fs.readFileSync(path.join(root,files[3])))}});
test('singleplayer adapter is restricted to explicit HTTP loopback addresses',()=>{
 for(const address of ['http://localhost:8000/','http://127.0.0.1:8000/','http://[::1]:8000/'])assert(localAddress(address));
 for(const address of ['https://dungeonblitzr.theminesa.studio/','http://localhost.example/','http://127.0.0.2/','http://localhost@evil.example/','http://x:secret@localhost/','garbage'])assert.equal(localAddress(address),false);
});
test('loopback aliases canonicalize without changing port, path or query',()=>{
 const {gameURL}=require('../src/policy.cjs');
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(gameURL('http://'+host+':8000/play?lang=en'),'http://localhost:8000/play?lang=en');
 assert.equal(gameURL('https://127.0.0.1:8000/play'),'https://127.0.0.1:8000/play');
});
test('local enhancements reconstruct independent compile and preserve every unrelated game method/tag',{skip:!present},()=>{
 const {input,compiled,recipes}=load();assert.equal(crypto.createHash('sha256').update(input).digest('hex'),require('../src/legacy/client-singleplayer.json').inputHash);
 const result=adaptClient(input,'http://localhost:8000/',recipes);assert(result.patched&&result.audio);assert.equal(result.mode,'contract');
 const before=readSWF(input),after=readSWF(result.patched),a=main(before).abc,b=main(after).abc,c=main(compiled).abc,edits=new Set(recipes.singleplayer.bodies.map(x=>x.name));
 assert.equal(edits.size,31);assert(a.interfaceContract.equals(b.interfaceContract));assert.deepEqual(b.pools,c.pools);
 for(const body of b.bodies)assert(body.bytes.equals(c.bodies.find(x=>x.id===body.id).bytes),'Independent compile '+body.name);
 for(const body of a.bodies)if(!edits.has(body.name))assert(body.bytes.equals(b.bodies.find(x=>x.id===body.id).bytes),'Preserve '+body.name);
 for(const tag of before.tags)if(tag!==main(before))assert(after.tags.some(x=>x.raw.equals(tag.raw)),'Keep native SWF tags');
 // Local-only server corrections, auth/key handling, save data and packets
 // remain original; this includes its corrected transition canvas allocator.
 for(const name of ['Game.method_1947','Game.method_1880','Game.method_702','Game.method_1949','class_108.method_907'])assert(a.bodies.find(x=>x.name===name).bytes.equals(b.bodies.find(x=>x.name===name).bytes));
 assert.equal(adaptClient(input,'https://dungeonblitzr.theminesa.studio/',recipes).patched,null,'Never select the local adapter on multiplayer');
});
test('multiplayer output remains identical; unknown local hooks reject instead of guessing',{skip:!present},()=>{
 const {input,recipes}=load(),live=fs.readFileSync(path.join(root,files[4])),old=adaptClient(live,'https://dungeonblitzr.theminesa.studio/',{multiplayer:recipes.multiplayer});
 assert(old.patched&&old.audio);assert.deepEqual(adaptClient(live,'https://dungeonblitzr.theminesa.studio/',recipes),old);
 const updated=readSWF(input),tag=main(updated),abc=tag.abc,body=abc.bodies.find(x=>x.name==='Entity.method_1826'),changed=Buffer.from(body.bytes);changed[body.codeOffset]^=1;
 const data=Buffer.concat([tag.lead,abc.prefix,...abc.bodies.map(x=>x===body?changed:x.bytes)]),bytes=writeSWF(updated,updated.tags.map(x=>x===tag?encodeTag(82,data):x.raw));
 const reused=adaptClient(bytes,'http://localhost:8000/',recipes);assert(reused.patched&&reused.audio,'Unrelated local server edits retain reviewed enhancements');assert(main(readSWF(reused.patched)).abc.bodies.find(x=>x.id===body.id).bytes.equals(changed),'Preserve the full local server change');
 for(const name of ['Main.method_561','SuperAnimData.method_200','class_119.OnRefreshScreen','Game.method_1947','Game.method_1880','SoundManager.Play']){
  const swf=readSWF(input),tag=main(swf),abc=tag.abc,body=abc.bodies.find(x=>x.name===name),changed=Buffer.from(body.bytes);changed[body.codeOffset]^=1;
  const data=Buffer.concat([tag.lead,abc.prefix,...abc.bodies.map(x=>x===body?changed:x.bytes)]),bytes=writeSWF(swf,swf.tags.map(x=>x===tag?encodeTag(82,data):x.raw));
  assert.equal(adaptClient(bytes,'http://localhost:8000/',recipes).patched,null,'Require review: '+name);
 }
});
