const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchAudio}=require('../src/legacy/audio-patch.cjs'),{patchClient}=require('../src/legacy/client-patch.cjs'),{makeDelta}=require('../scripts/audio-delta.cjs');
test('audio delta reconstructs inserted bytes and refuses damaged or unbounded data',()=>{
 const before=Buffer.from('original safe data '.repeat(40)),after=Buffer.concat([before.subarray(0,90),Buffer.from('new audio code'),before.subarray(90)]),delta=makeDelta(before,after);
 const header=Buffer.alloc(8);header.write('CWS');header[3]=10;header.writeUInt32LE(before.length+8,4);const swf=Buffer.concat([header,zlib.deflateSync(before)]);
 assert.deepEqual(zlib.inflateSync(patchAudio(swf,delta).subarray(8)),after);
 for(const damaged of [{...delta,inputHash:'bad'},{...delta,outputHash:'bad'},{...delta,outputLength:4*1024*1024},{...delta,operations:[{copy:[-1,100]}]},{...delta,operations:[{copy:[0,99999]}]},{...delta,operations:[{data:'bad'}]}])assert.equal(patchAudio(swf,damaged),null);
 assert.equal(patchAudio(Buffer.from('broken'),delta),null);
});
const root=path.resolve(__dirname,'..'),live=path.join(root,'.test-tools/focus/live.swf'),delta=path.join(root,'runtime/game/resources/audio-delta.json'),compiled=path.join(root,'.test-tools/audio/audio.swf');
const current=path.join(root,'.test-tools/focus/current.swf'),currentDelta=path.join(root,'runtime/game/resources/audio-delta-current.json'),currentCompiled=path.join(root,'.test-tools/audio-current/audio.swf');
test('October 10 audio/display adapter exactly reconstructs its separately compiled reviewed revision',{skip:![current,currentDelta,currentCompiled].every(fs.existsSync)},()=>{
 const presentation=patchClient(fs.readFileSync(current));assert(presentation);
 const audio=patchAudio(presentation,JSON.parse(fs.readFileSync(currentDelta)));assert(audio);
 assert.deepEqual(zlib.inflateSync(audio.subarray(8)),zlib.inflateSync(fs.readFileSync(currentCompiled).subarray(8)));
 const body=zlib.inflateSync(audio.subarray(8));assert(!body.includes(Buffer.from('BlitzTransitionFixtureControl')));assert(!body.includes(Buffer.from('FPSFixtureControl')));
 assert.equal(patchAudio(presentation,JSON.parse(fs.readFileSync(delta))),null,'Historical adapter must never be applied to the new client');
 const changed=Buffer.from(presentation);changed[changed.length-1]^=1;assert.equal(patchAudio(changed,JSON.parse(fs.readFileSync(currentDelta))),null);
});
test('reviewed audio delta matches the independently compiled client',{skip:![live,delta,compiled].every(fs.existsSync)},()=>{
 const presentation=patchClient(fs.readFileSync(live));assert(presentation);
 const audio=patchAudio(presentation,JSON.parse(fs.readFileSync(delta)));assert(audio);
 assert.deepEqual(zlib.inflateSync(audio.subarray(8)),zlib.inflateSync(fs.readFileSync(compiled).subarray(8)));
 const body=zlib.inflateSync(audio.subarray(8));assert(!body.includes(Buffer.from('BlitzTransitionFixtureControl')));assert(body.includes(Buffer.from('BlitzFrameCounter')),'Production counter must be in the reviewed adapter');
 assert(!body.includes(Buffer.from('FPSFixtureControl')),'Test clock/stall controls must not enter the production client delta');
 const changed=Buffer.from(presentation);changed[changed.length-1]^=1;assert.equal(patchAudio(changed,JSON.parse(fs.readFileSync(delta))),null);
});
