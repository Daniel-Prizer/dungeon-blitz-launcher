const fs=require('fs'),assert=require('assert/strict'),test=require('node:test');
const {readSWF,writeSWF,encodeTag}=require('../src/legacy/swf-contract.cjs'),{patchAdaptiveClient}=require('../src/legacy/adaptive-patch.cjs');
const source='.test-tools/focus/deployed-evening-oct19.swf',file='runtime/game/resources/adaptive-contract-backdrop-oct19.json',main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
function exceptions(b){let p=b.codeOffset+b.code.length;const u=()=>{let n=0,shift=0,c;do{c=b.bytes[p++];n|=(c&127)<<shift;shift+=7;}while(c&128);return n>>>0;};const count=u(),items=[];for(let i=0;i<count;i++)items.push([u(),u(),u(),u(),u()]);return items;}
test('background budget contract preserves native guard, catch, all unrelated methods and singleplayer separation',{skip:!fs.existsSync(source)||!fs.existsSync(file)},()=>{
 const input=fs.readFileSync(source),recipe=JSON.parse(fs.readFileSync(file)),base=JSON.parse(fs.readFileSync('runtime/game/resources/adaptive-contract-map-oct19.json')),prior=readSWF(patchAdaptiveClient(input,base)),output=patchAdaptiveClient(input,recipe);assert(output);const before=readSWF(input),after=readSWF(output),abc=main(before).abc,out=main(after).abc;
 const native=abc.bodies.find(b=>b.name==='class_82.method_193'),fixed=out.bodies.find(b=>b.id===native.id);assert.equal(fixed.code.length,native.code.length+14);assert.deepEqual(exceptions(fixed),exceptions(native).map(e=>[e[0]+14,e[1]+14,e[2]+14,e[3],e[4]]));
 for(const body of main(prior).abc.bodies)if(body.id!==native.id)assert(body.bytes.equals(out.bodies.find(b=>b.id===body.id).bytes),body.name);
 for(const tag of before.tags)if(tag!==main(before))assert(after.tags.some(t=>t.raw.equals(tag.raw)));
 assert.deepEqual(recipe.bodies.filter(b=>!base.bodies.some(p=>p.id===b.id)).map(b=>b.name),['class_82.method_193']);
 const damaged=Buffer.from(native.bytes);damaged[damaged.length-2]^=1;const tag=main(before),bytes=Buffer.concat([tag.lead,abc.prefix,...abc.bodies.map(b=>b.id===native.id?damaged:b.bytes)]),bad=writeSWF(before,before.tags.map(t=>t===tag?encodeTag(82,bytes):t.raw));assert.equal(patchAdaptiveClient(bad,recipe),null);
 const local=fs.readFileSync('.test-tools/focus/singleplayer.swf');assert.equal(patchAdaptiveClient(local,recipe),null);
});
