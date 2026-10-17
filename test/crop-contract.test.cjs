'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {readSWF,writeSWF,encodeTag}=require('../src/legacy/swf-contract.cjs'),{adaptClient}=require('../src/legacy/client-adapter.cjs');
const sources=['.test-tools/focus/deployed-oct17.swf',...['adaptive-contract','adaptive-contract-oct15','adaptive-contract-oct16','adaptive-contract-oct17'].map(n=>'runtime/game/resources/'+n+'.json')],present=sources.every(f=>fs.existsSync(f)),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
test('October 17 revises one exact crop expression and retains complete native cleanup/recovery',{skip:!present},()=>{
 const input=fs.readFileSync(sources[0]),recipes=sources.slice(1).map(f=>JSON.parse(fs.readFileSync(f))),pin=require('../src/legacy/client-crop-oct17.json'),recipe=recipes.at(-1);assert.equal(hash(input),pin.inputHash);assert.equal(adaptClient(input,pin.url,{multiplayer:recipes.slice(0,3)}).patched,null);
 for(const key of Object.keys(recipe))if(!['sourceHash','bodies'].includes(key))assert.deepEqual(recipe[key],recipes[2][key]);
 assert.equal(recipe.bodies.filter((b,i)=>JSON.stringify(b)!==JSON.stringify(recipes[2].bodies[i])).length,1);
 const result=adaptClient(input,pin.url,{multiplayer:recipes});assert(result.patched&&result.audio);const before=readSWF(input),after=readSWF(result.patched),abc=main(before).abc,out=main(after).abc,edited=new Set(recipe.bodies.map(b=>b.id));
 for(const b of abc.bodies)if(!edited.has(b.id))assert(b.bytes.equals(out.bodies.find(o=>o.id===b.id).bytes),b.name);
 const crop=abc.bodies.find(b=>b.name===pin.method),patched=out.bodies.find(b=>b.id===crop.id),start=crop.codeOffset+pin.cropOffset;assert.equal(hash(crop.bytes),pin.bodyHash);assert(crop.bytes.subarray(0,start).equals(patched.bytes.subarray(0,start)));assert(crop.bytes.subarray(start+12).equals(patched.bytes.subarray(start+12)));
 for(const tag of before.tags)if(tag!==main(before))assert(after.tags.some(t=>t.raw.equals(tag.raw)));
 const changed=Buffer.from(crop.bytes);changed[crop.codeOffset]^=1;const tag=main(before),data=Buffer.concat([tag.lead,abc.prefix,...abc.bodies.map(b=>b.id===crop.id?changed:b.bytes)]),tampered=writeSWF(before,before.tags.map(t=>t===tag?encodeTag(82,data):t.raw));assert.equal(adaptClient(tampered,pin.url,{multiplayer:recipes}).patched,null);
 const local=JSON.parse(fs.readFileSync('runtime/game/resources/adaptive-contract-singleplayer.json')),localInput=fs.readFileSync('.test-tools/focus/singleplayer.swf');assert.deepEqual(adaptClient(localInput,'http://localhost:8000/',{multiplayer:recipes,singleplayer:local}),adaptClient(localInput,'http://localhost:8000/',{multiplayer:recipes.slice(0,3),singleplayer:local}));
});
