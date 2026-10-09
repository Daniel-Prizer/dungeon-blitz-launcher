const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchClient}=require('../src/legacy/client-patch.cjs'),revision=require('../src/legacy/client-layout.json');
test('client compatibility rejects unreviewed, malformed and oversized input',()=>{
 for(const input of [null,'text',Buffer.alloc(0),Buffer.from('CWSnotaswf'),Buffer.alloc(3*1024*1024)])assert.equal(patchClient(input),null);
});
test('reviewed client edits only layout, debug-local descriptions and focus presentation',{skip:!fs.existsSync(path.join(__dirname,'../.test-tools/focus/live.swf'))},()=>{
 const input=fs.readFileSync(path.join(__dirname,'../.test-tools/focus/live.swf')),out=patchClient(input);assert(out);
 const before=zlib.inflateSync(input.subarray(8)),after=zlib.inflateSync(out.subarray(8)),r=revision;
 assert.equal(after.length,before.length+6);assert.equal(out.readUInt32LE(4),after.length+8);
 assert.equal(after[r.focus.start],0x47);assert(after.subarray(r.focus.start+1,r.focus.start+r.focus.length).every(b=>b===2));
 // Every byte outside the two reviewed methods and their size fields is retained.
 const normal=Buffer.concat([after.subarray(0,r.layout.start),before.subarray(r.layout.start,r.layout.start+r.layout.length),after.subarray(r.layout.start+r.layout.length+6)]);
 before.subarray(r.focus.start,r.focus.start+r.focus.length).copy(normal,r.focus.start);
 before.subarray(r.abcLengthPosition,r.abcLengthPosition+4).copy(normal,r.abcLengthPosition);
 before.subarray(r.layout.lengthPosition,r.layout.start).copy(normal,r.layout.lengthPosition);
 assert.deepEqual(normal,before);
 const changed=Buffer.from(input);changed[changed.length-1]^=1;assert.equal(patchClient(changed),null,'Even a one-byte client change must not use stale offsets');
});
