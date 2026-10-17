'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {readSWF}=require('../src/legacy/swf-contract.cjs'),{patchAdaptiveClient}=require('../src/legacy/adaptive-patch.cjs'),{makeDelta}=require('./audio-delta.cjs');
const root=path.resolve(__dirname,'..'),review=require('../src/legacy/client-crop-oct17.json'),source=path.join(root,'.test-tools/focus/deployed-oct17.swf');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
(async()=>{
 if(!fs.existsSync(source)){const response=await fetch(review.url,{signal:AbortSignal.timeout(30000)});assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),review.inputHash);fs.writeFileSync(source,bytes);}
 const input=fs.readFileSync(source);assert.equal(hash(input),review.inputHash);
 const swf=readSWF(input),abc=main(swf).abc,body=abc.bodies.find(b=>b.name===review.method);assert.equal(hash(body.bytes),review.bodyHash);assert.equal(hash(body.code),review.codeHash);
 const base=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract-oct16.json')));assert.equal(patchAdaptiveClient(input,base),null);
 const compiled=main(readSWF(fs.readFileSync(path.join(root,'.test-tools/audio-oct11/audio.swf')))).abc.bodies.find(b=>b.name===review.method),edit=base.bodies.find(b=>b.name===review.method);
 const original=fs.readFileSync(path.join(root,'.test-tools/focus/oct11.swf'));assert.equal(hash(original),require('../src/legacy/client-layout-oct11.json').inputHash);
 const originalRecipe=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract.json'))),reconstructed=patchAdaptiveClient(original,originalRecipe);assert(reconstructed);assert(compiled.bytes.equals(main(readSWF(reconstructed)).abc.bodies.find(b=>b.name===review.method).bytes),'Crop template must match the independently verified original recipe');
 const start=body.codeOffset+review.cropOffset,bytes=Buffer.from(body.bytes),expected=Buffer.from(review.expression,'hex');assert.equal(expected.length,12);assert(bytes.subarray(start,start+12).equals(expected));
 const template=compiled.code.subarray(review.previousCropOffset,review.previousCropOffset+12);assert.equal(template[0],0x29);assert.equal(template[1],0x60);assert.equal(template.length,12);template.copy(bytes,start);
 const refs=edit.references.map(ref=>{const offset=ref.offset-compiled.codeOffset-review.previousCropOffset;assert(offset>=0&&offset<12,'Only reviewed crop operands relocate');return {...ref,offset:start+offset};});assert.equal(refs.length,2);
 const recipe=structuredClone(base),updated=recipe.bodies.find(b=>b.name===review.method);updated.delta=makeDelta(body.bytes,bytes);updated.references=refs;recipe.sourceHash=review.inputHash;
 const output=patchAdaptiveClient(input,recipe);assert(output,'Complete interface/pools/dependencies and remaining hooks must match');
 const after=readSWF(output),edited=new Set(recipe.bodies.map(b=>b.id));
 for(const b of abc.bodies)if(!edited.has(b.id))assert(b.bytes.equals(main(after).abc.bodies.find(a=>a.id===b.id).bytes),'Preserve '+b.name);
 // The sole revised hook retains every byte of the new cleanup logic and its
 // exception envelope, outside the same twelve-byte crop expression.
 const result=main(after).abc.bodies.find(b=>b.id===body.id);assert(result.bytes.subarray(0,start).equals(body.bytes.subarray(0,start)));assert(result.bytes.subarray(start+12).equals(body.bytes.subarray(start+12)));
 for(const tag of swf.tags)if(tag!==main(swf))assert(after.tags.some(t=>t.raw.equals(tag.raw)));
 fs.writeFileSync(path.join(root,'runtime/game/resources/adaptive-contract-oct17.json'),JSON.stringify(recipe));console.log('Prepared October 17 crop contract; native cleanup, recovery and all unrelated code preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
