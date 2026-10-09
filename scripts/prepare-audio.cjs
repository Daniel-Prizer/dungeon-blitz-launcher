const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/audio'),focus=path.join(root,'.test-tools/focus');fs.mkdirSync(dir,{recursive:true});
if(!fs.existsSync(path.join(focus,'live.swf'))||!fs.existsSync(path.join(focus,'ffdec/ffdec.jar')))execFileSync(process.execPath,[path.join(__dirname,'prepare-margin-fixture.cjs')],{stdio:'inherit',windowsHide:true});
const crypto=require('node:crypto');
const stamp=crypto.createHash('sha256');for(const file of [__filename,path.join(__dirname,'AudioPatchBuilder.java'),path.join(__dirname,'audio-delta.cjs'),path.join(root,'src/legacy/BlitzAudio.as'),path.join(root,'src/legacy/client-patch.cjs'),path.join(root,'test/audio-fixture/DungeonBlitz.as'),path.join(focus,'live.swf')])stamp.update(fs.readFileSync(file));
const buildStamp=stamp.digest('hex'),stampFile=path.join(dir,'build-stamp'),deltaFile=path.join(root,'runtime/game/resources/audio-delta.json');
if(fs.existsSync(stampFile)&&fs.readFileSync(stampFile,'utf8')===buildStamp&&fs.existsSync(deltaFile)&&fs.existsSync(path.join(dir,'fixture.swf'))){console.log('Reviewed audio adapter already current.');process.exit(0);}
const u=value=>{const out=[];do{const b=value&127;value>>>=7;out.push(b|(value?128:0));}while(value);return Buffer.from(out);};
const b=(...parts)=>Buffer.concat(parts.map(p=>Buffer.isBuffer(p)?p:Buffer.from(p)));
const str=s=>b(u(Buffer.byteLength(s)),Buffer.from(s));
// Minimal launcher-owned AS3 class definition, compiled against the reviewed
// client's definitions. No game code is included in this source stub.
const pool=b([1,1,1,3],str('BlitzAudio'),str('Object'),[2,0x16,0,1,3,7,1,1,7,1,2]);
const methods=b([3,0,0,0,0,0,0,0,0,0,0,0,0]);
const types=b([0,1,1,2,0,0,0,0,1,0,1,2,1,1,4,1,0]);
const body=(index,stack,scope,code)=>b([index,stack,1,scope,scope+1],u(code.length),code,[0,0]);
const abc=b([16,0,46,0],pool,methods,types,[3],body(0,1,1,[0xd0,0x30,0xd0,0x49,0,0x47]),body(1,1,1,[0xd0,0x30,0x47]),body(2,2,0,[0xd0,0x30,0x65,0,0x60,2,0x30,0x60,2,0x58,0,0x1d,0x68,1,0x47]));
const payload=b([1,0,0,0],Buffer.from('blitz-audio\0'),abc),tagHeader=Buffer.alloc(6);tagHeader.writeUInt16LE((82<<6)|63);tagHeader.writeUInt32LE(payload.length,2);
const live=fs.readFileSync(path.join(focus,'live.swf')),patched=require('../src/legacy/client-patch.cjs').patchClient(live);if(!patched)throw Error('Unreviewed source client');
const swf=zlib.inflateSync(patched.subarray(8));const rectBytes=Math.ceil((5+4*(swf[0]>>3))/8);let start=rectBytes+4;
while(start<swf.length){const h=swf.readUInt16LE(start);if((h>>6)===1)break;const short=h&63;start+=short===63?6+swf.readUInt32LE(start+2):2+short;}
const assembled=b(swf.subarray(0,start),tagHeader,payload,swf.subarray(start));const header=Buffer.from(patched.subarray(0,8));header.writeUInt32LE(assembled.length+8,4);
fs.writeFileSync(path.join(dir,'stub.swf'),b(header,zlib.deflateSync(assembled)));
const jar=path.join(focus,'ffdec/ffdec.jar');
execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',path.join(dir,'stub.swf'),path.join(dir,'helper.swf'),'BlitzAudio',path.join(root,'src/legacy/BlitzAudio.as')],{stdio:'inherit',windowsHide:true});
execFileSync('javac',['-cp',path.join(focus,'ffdec/lib/*'),'-d',dir,path.join(__dirname,'AudioPatchBuilder.java')],{stdio:'inherit',windowsHide:true});
execFileSync('java',['-Djava.awt.headless=true','-cp',dir+path.delimiter+path.join(focus,'ffdec/lib/*'),'AudioPatchBuilder',path.join(dir,'helper.swf'),path.join(dir,'audio.swf')],{stdio:'inherit',windowsHide:true});
const before=zlib.inflateSync(patched.subarray(8)),after=zlib.inflateSync(fs.readFileSync(path.join(dir,'audio.swf')).subarray(8));
const delta=require('./audio-delta.cjs').makeDelta(before,after);
const tested=require('../src/legacy/audio-patch.cjs').patchAudio(patched,delta);
if(!tested||!zlib.inflateSync(tested.subarray(8)).equals(after))throw Error('Audio delta did not reconstruct compiled output');
const output=path.join(root,'runtime/game/resources/audio-delta.json');fs.writeFileSync(output,JSON.stringify(delta));
execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-importScript',path.join(dir,'audio.swf'),path.join(dir,'fixture.swf'),path.join(root,'test/audio-fixture')],{stdio:'inherit',windowsHide:true});
console.log('Audio delta bytes:',fs.statSync(output).size,'operations:',delta.operations.length);
console.log('Prepared reviewed client with launcher-owned audio helper.');
fs.writeFileSync(stampFile,buildStamp);
