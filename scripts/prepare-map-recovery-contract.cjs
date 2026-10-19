'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {readSWF}=require('../src/legacy/swf-contract.cjs'),{patchAdaptiveClient}=require('../src/legacy/adaptive-patch.cjs'),{makeDelta}=require('./audio-delta.cjs');
const root=path.resolve(__dirname,'..'),pin=require('../src/legacy/client-map-recovery-oct19.json'),source=path.join(root,'.test-tools/focus/deployed-oct19.swf');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),main=s=>s.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Main.method_561'));
(async()=>{
 if(!fs.existsSync(source)){const r=await fetch(pin.url,{signal:AbortSignal.timeout(30000)});assert(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(hash(b),pin.inputHash);fs.writeFileSync(source,b);}
 const input=fs.readFileSync(source);assert.equal(hash(input),pin.inputHash);
 const base=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract-recovery-oct17.json')));assert.equal(patchAdaptiveClient(input,base),null);
 const before=readSWF(input),abc=main(before).abc,body=abc.bodies.find(b=>b.name===pin.method);assert.equal(hash(body.bytes),pin.bodyHash);assert.equal(hash(body.code),pin.codeHash);
 const start=body.codeOffset+pin.offset,changed=Buffer.from(body.bytes);assert.equal(changed.subarray(start,start+6).toString('hex'),'60c70166fa01');
 // Existing authored 1152-pixel map width. Same six-byte range: preserve
 // every native branch/handler, including the newly added map recovery catch.
 Buffer.from('258009020202','hex').copy(changed,start);
 const recipe=structuredClone(base),edit=recipe.bodies.find(b=>b.name===pin.method);assert.equal(edit.references.length,0);edit.delta=makeDelta(body.bytes,changed);recipe.sourceHash=pin.inputHash;
 const output=patchAdaptiveClient(input,recipe);assert(output,'All other complete contract checks must pass');
 const after=readSWF(output),out=main(after).abc,edited=new Set(recipe.bodies.map(b=>b.id));
 for(const b of abc.bodies)if(!edited.has(b.id))assert(b.bytes.equals(out.bodies.find(a=>a.id===b.id).bytes),'Preserve '+b.name);
 const result=out.bodies.find(b=>b.id===body.id);assert(result.bytes.subarray(0,start).equals(body.bytes.subarray(0,start)));assert(result.bytes.subarray(start+6).equals(body.bytes.subarray(start+6)));
 for(const t of before.tags)if(t!==main(before))assert(after.tags.some(a=>a.raw.equals(t.raw)));
 fs.writeFileSync(path.join(root,'runtime/game/resources/adaptive-contract-map-oct19.json'),JSON.stringify(recipe));console.log('Prepared exact October 19 map-width contract; every new recovery handler and unrelated method retained.');
})().catch(e=>{console.error(e);process.exitCode=1});
