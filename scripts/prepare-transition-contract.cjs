'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {readSWF}=require('../src/legacy/swf-contract.cjs'),{patchAdaptiveClient}=require('../src/legacy/adaptive-patch.cjs');
const root=path.resolve(__dirname,'..'),review=require('../src/legacy/client-transition-oct15.json'),source=path.join(root,'.test-tools/focus/deployed-oct15.swf');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
(async()=>{
 if(!fs.existsSync(source)){const res=await fetch(review.url,{signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Reviewed transition source HTTP '+res.status);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(hash(bytes),review.inputHash);fs.writeFileSync(source,bytes);}
 const input=fs.readFileSync(source);assert.equal(hash(input),review.inputHash,'Unreviewed transition source');
 const base=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract.json'))),swf=readSWF(input),abc=main(swf).abc;
 assert.equal(base.sourceHash,require('../src/legacy/client-layout-oct11.json').inputHash);
 const body=abc.bodies.find(b=>b.name===review.method);assert(body);assert.equal(hash(body.bytes),review.bodyHash);assert.equal(hash(body.code),review.codeHash);
 // The preceding 563 bytecode bytes retain their meaning. The old unreachable
 // obfuscator branch at 36 is normalized to its next instruction; only a
 // bounded 37-byte recovery handler and its exact exception range are added.
 const previous=Buffer.from(body.code.subarray(0,563));assert.equal(previous[37],0);assert.equal(previous[38],0);previous[37]=10;previous[38]=2;
 assert.equal(hash(previous),review.previousCodeHash);
 assert.equal(body.code.subarray(563).toString('hex'),'29d06656d0665666d00961b305d066562061d009d06656240061de11d06656240061951147');
 assert.equal(body.bytes.subarray(body.codeOffset+body.code.length).toString('hex'),'01ac03e103b304000000');
 assert.equal(patchAdaptiveClient(input,base),null,'The previous contract must continue rejecting this changed dependency');
 const recipe=structuredClone(base),guard=recipe.guards.find(g=>g.name===review.method);assert(guard&&guard.id===body.id);guard.hash=review.bodyHash;recipe.sourceHash=review.inputHash;
 const output=patchAdaptiveClient(input,recipe);assert(output,'Full unchanged pool/interface/hook/other dependency guards must pass');
 const after=readSWF(output),edited=new Set(recipe.bodies.map(b=>b.id));
 for(const b of abc.bodies)if(!edited.has(b.id))assert(b.bytes.equals(main(after).abc.bodies.find(a=>a.id===b.id).bytes),'Preserve original '+b.name);
 for(const tag of swf.tags)if(tag!==main(swf))assert(after.tags.some(t=>t.raw.equals(tag.raw)));
 fs.writeFileSync(path.join(root,'runtime/game/resources/adaptive-contract-oct15.json'),JSON.stringify(recipe));
 console.log('Prepared separately guarded October 15 contract; upstream recovery and every unrelated method/tag retained.');
})().catch(error=>{console.error(error);process.exitCode=1;});
