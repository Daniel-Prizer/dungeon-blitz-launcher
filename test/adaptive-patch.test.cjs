'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readSWF,encodeTag,writeSWF,encodePools,integer}=require('../src/legacy/swf-contract.cjs'),{patchAdaptiveClient}=require('../src/legacy/adaptive-patch.cjs'),{patchClient}=require('../src/legacy/client-patch.cjs');
const root=path.resolve(__dirname,'..'),files=['runtime/game/resources/adaptive-contract.json','.test-tools/focus/oct11.swf','.test-tools/focus/deployed.swf','.test-tools/audio-oct11/audio.swf'];
const present=files.every(file=>fs.existsSync(path.join(root,file))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const main=swf=>swf.tags.find(tag=>tag.abc&&tag.abc.bodies.some(body=>body.name==='Main.method_561'));
function setup(){return {recipe:JSON.parse(fs.readFileSync(path.join(root,files[0]))),original:fs.readFileSync(path.join(root,files[1])),current:fs.readFileSync(path.join(root,files[2])),compiled:readSWF(fs.readFileSync(path.join(root,files[3])))};}
function rewrite(input,change){const swf=readSWF(input),tag=main(swf),data=change(tag.abc);return writeSWF(swf,swf.tags.map(t=>t===tag?encodeTag(82,Buffer.concat([tag.lead,data])):t.raw));}
test('reusable adapter reproduces reviewed compiled hooks and preserves game interfaces',{skip:!present},()=>{
 const {recipe,original,compiled}=setup(),output=readSWF(patchAdaptiveClient(original,recipe)),a=main(output).abc,b=main(compiled).abc;
 assert(a.interfaceContract.equals(b.interfaceContract));assert.deepEqual(a.pools,b.pools);for(const body of a.bodies)assert(body.bytes.equals(b.bodies.find(other=>other.id===body.id).bytes));
 assert.deepEqual(output.tags.filter(t=>t!==main(output)).map(t=>t.data),compiled.tags.filter(t=>t!==main(compiled)).map(t=>t.data));
});
test('new live deployment reuses previous hooks without its own revision pin; all Minesa changes survive',{skip:!present},()=>{
 const {recipe,current,compiled}=setup();assert.equal(patchClient(current),null,'This deployment has no exact-revision adapter');assert.notEqual(hash(current),recipe.sourceHash);
 const before=readSWF(current),patched=patchAdaptiveClient(current,recipe);assert(patched);const after=readSWF(patched),a=main(before).abc,b=main(after).abc,oldCompiled=main(compiled).abc,edited=new Set(recipe.bodies.map(body=>body.id));
 assert(a.interfaceContract.equals(b.interfaceContract));assert(b.prefix.subarray(b.poolEnd).equals(a.prefix.subarray(a.poolEnd)),'Keep all current method/class/script definitions, including new duplicate symbol references');
 for(const body of a.bodies)if(!edited.has(body.id))assert(body.bytes.equals(b.bodies.find(other=>other.id===body.id).bytes),'Preserve original '+body.name);
 for(const tag of before.tags)if(tag!==main(before))assert(after.tags.some(other=>other.raw.equals(tag.raw)),'Preserve every original non-hook tag');
 let relocations=0;for(const edit of recipe.bodies)for(const ref of edit.references){const body=b.bodies.find(body=>body.id===edit.id),index=a.pools[ref.pool].length+ref.index-recipe.pools[ref.pool].count;
   assert(body.bytes.subarray(ref.offset,ref.offset+integer(index).length).equals(integer(index)));assert.equal(b.referenceHash(ref.pool,index),oldCompiled.referenceHash(ref.pool,ref.index),'Relocated helper operand must retain the independently compiled symbol');relocations++;
 }assert.equal(relocations,116);
 const old=main(readSWF(fs.readFileSync(path.join(root,files[1])))).abc;const changed=a.bodies.filter(body=>!body.bytes.equals(old.bodies.find(other=>other.id===body.id).bytes));assert(changed.length>=12);assert(changed.every(body=>!edited.has(body.id)));assert(changed.some(body=>body.name==='class_56.renderWorldRows'));
});
test('unrelated code edits survive; changed hooks, input dependencies, constants and bindings fail closed',{skip:!present},()=>{
 const {recipe,current}=setup();
 const changeBody=name=>rewrite(current,abc=>{const body=abc.bodies.find(body=>body.name===name),bytes=Buffer.from(body.bytes);bytes[body.codeOffset]^=1;return Buffer.concat([abc.prefix,...abc.bodies.map(other=>other===body?bytes:other.bytes)]);});
 assert(patchAdaptiveClient(changeBody('class_56.renderWorldRows'),recipe));
 for(const name of ['class_119.OnCreateScreen','class_119.OnRefreshScreen','Camera.method_1073','Main.method_561','SoundManager.Play','Game.method_1880','Game.method_1947'])assert.equal(patchAdaptiveClient(changeBody(name),recipe),null,name+' must require review');
 const changedPool=rewrite(current,abc=>{const pools={...abc.pools,ints:[...abc.pools.ints]};pools.ints[1]^=1;return Buffer.concat([abc.prefix.subarray(0,4),encodePools(pools),abc.prefix.subarray(abc.poolEnd),...abc.bodies.map(body=>body.bytes)]);});assert.equal(patchAdaptiveClient(changedPool,recipe),null);
 const changedBinding=readSWF(current);const binding=changedBinding.tags.find(tag=>tag.type===76),data=Buffer.from(binding.data);data[data.length-2]^=1;assert.equal(patchAdaptiveClient(writeSWF(changedBinding,changedBinding.tags.map(tag=>tag===binding?encodeTag(76,data):tag.raw)),recipe),null);
 const output=patchAdaptiveClient(current,recipe);assert.equal(patchAdaptiveClient(output,recipe),null,'Never attach helpers twice');
});
test('malformed input, bad local recipe and variable-width relocations are rejected',{skip:!present},()=>{
 const {recipe,current}=setup();for(const input of [null,Buffer.alloc(0),Buffer.from('CWSbad'),Buffer.alloc(3*1024*1024),current.subarray(0,100)])assert.equal(patchAdaptiveClient(input,recipe),null);
 for(const damaged of [{...recipe,interfaceHash:'bad'},{...recipe,preambleHash:'bad'},{...recipe,helpers:recipe.helpers.map((entry,n)=>n===0?{...entry,hash:'bad'}:entry)},{...recipe,bodies:[...recipe.bodies,recipe.bodies[0]]}])assert.equal(patchAdaptiveClient(current,damaged),null);
 const enormousPool=rewrite(current,abc=>{const pools={...abc.pools,multinames:[...abc.pools.multinames]};while(pools.multinames.length<16400)pools.multinames.push([17]);return Buffer.concat([abc.prefix.subarray(0,4),encodePools(pools),abc.prefix.subarray(abc.poolEnd),...abc.bodies.map(body=>body.bytes)]);});assert.equal(patchAdaptiveClient(enormousPool,recipe),null,'A changed operand width would require branch relocation and human review');
 const wrongLength=Buffer.from(current);wrongLength.writeUInt32LE(0xffffffff,4);assert.throws(()=>readSWF(wrongLength));assert.equal(patchAdaptiveClient(wrongLength,recipe),null);
});
