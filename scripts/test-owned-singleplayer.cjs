'use strict';
// Real bundled HTTP/TCP servers, disposable local data and normal game packets.
// No launcher/game windows, saved profiles, external accounts or shared ports.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
const {fork}=require('node:child_process'),{Singleplayer}=require('../src/singleplayer.cjs');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(root,'artifacts/singleplayer-test-'));
const create=name=>new Singleplayer({bundle:path.join(root,'runtime/singleplayer'),dataDir:path.join(out,name),fork:(entry,args,options)=>fork(entry,args,{...options,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true})});
const a=create('world-a'),b=create('world-b'),c=create('world-a');
async function request(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());}
async function policy(port){return new Promise((resolve,reject)=>{let data='';const socket=net.connect(port,'127.0.0.1',()=>socket.write('<policy-file-request/>\0'));socket.setTimeout(4000,()=>socket.destroy(Error('policy timeout')));socket.on('error',reject);socket.on('data',b=>{data+=b;if(data.includes('\0'))socket.end();});socket.on('close',()=>{assert.match(data,/cross-domain-policy/);resolve();});});}
(async()=>{try{
 const [one,duplicate]=await Promise.all([a.start(),a.start()]);assert.deepEqual(one,duplicate);const two=await b.start();assert.notEqual(one.ports.http,two.ports.http);assert.notEqual(one.ports.game,two.ports.game);
 await assert.rejects(c.start(),/already open/);await c.stop();
 const client=await request(one.url+'p/cbp/DungeonBlitz.swf?lang=en');assert.equal(require('crypto').createHash('sha256').update(client).digest('hex'),require('../src/legacy/client-singleplayer.json').inputHash);
 const {adaptClient}=require('../src/legacy/client-adapter.cjs'),{localizeClient}=require('../src/legacy/singleplayer-network.cjs');
 const contract=JSON.parse(fs.readFileSync(path.join(root,'runtime/game/resources/adaptive-contract-singleplayer.json')));
 const adapted=adaptClient(client,one.url,{multiplayer:[],singleplayer:contract});assert.equal(adapted.mode,'contract');assert(adapted.audio);const changed=localizeClient(adapted.patched,one.url,one.ports);assert(changed);
 const {readSWF}=require('../src/legacy/swf-contract.cjs'),before=readSWF(adapted.patched),after=readSWF(changed),main=swf=>swf.tags.find(t=>t.abc?.bodies.some(b=>b.name==='Connection.cinit'));
 const old=main(before),next=main(after);assert.deepEqual(old.abc.bodies.filter(b=>b.name!=='Connection.cinit').map(b=>b.bytes),next.abc.bodies.filter(b=>b.name!=='Connection.cinit').map(b=>b.bytes));
 assert.deepEqual(before.tags.filter(t=>t!==old).map(t=>t.raw),after.tags.filter(t=>t!==next).map(t=>t.raw));assert.equal(next.abc.pools.ints.at(-1),one.ports.game);
 for(const name of ['UI_1.swf','LevelsTut.swf','LevelsOMM.swf'])assert((await request(one.url+'p/cbp/'+name)).length>1000);
 await policy(one.ports.game);await policy(two.ports.game);
 // Exercise local account creation and its original character list response
 // using a synthetic packet fixture, in this disposable new world only.
 const {BitBuffer}=require('../runtime/singleplayer/server/network/protocol/bitBuffer.js');
 const packet=(id,payload)=>{const header=Buffer.alloc(4);header.writeUInt16BE(id);header.writeUInt16BE(payload.length,2);return Buffer.concat([header,payload]);};
 await new Promise((resolve,reject)=>{const socket=net.connect(one.ports.game,'127.0.0.1');let bytes=Buffer.alloc(0),sent=false;socket.setTimeout(8000,()=>socket.destroy(Error('login fixture timeout')));socket.on('error',reject);socket.on('connect',()=>{const bb=new BitBuffer();bb.writeMethod9(1);socket.write(packet(0x11,bb.toBuffer()));});socket.on('data',part=>{bytes=Buffer.concat([bytes,part]);while(bytes.length>=4&&bytes.length>=4+bytes.readUInt16BE(2)){const id=bytes.readUInt16BE(0),size=bytes.readUInt16BE(2);bytes=bytes.subarray(size+4);if(id===0x12&&!sent){sent=true;const bb=new BitBuffer();for(const value of ['','','owned-fixture@example.invalid','synthetic-local-only','',''])bb.writeMethod26(value);socket.write(packet(0x13,bb.toBuffer()));}if(id===0x15){socket.end();resolve();}}});});
 await a.stop();assert.equal(a.status.phase,'stopped');assert(!fs.existsSync(path.join(out,'world-a/instance.lock')));assert(fs.statSync(path.join(out,'world-a/data/Accounts.json')).size>10);
 await request(two.url+'healthz');const again=await a.start();await policy(again.ports.game);await a.stop();await b.stop();
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({ok:true,checks:['independent ephemeral ports','idempotent start','exclusive save ownership','reviewed local contract and all other method/tag bytes retained','UI and dungeon assets','real socket policy','local account/character-list protocol','graceful save/stop','restart persistence','other instance unaffected']},null,2));console.log('Owned singleplayer checks passed: '+out);
 }finally{await Promise.all([a.stop(),b.stop(),c.stop()]);}})().catch(e=>{console.error(e);process.exitCode=1;});
