'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const {readMessages}=require('../src/legacy/transport.cjs');
const {gameEnvironment}=require('../src/game-environment.cjs');
test('command framing survives fragmented UTF-8 and multiple messages, bounds bytes before newline',()=>{
 const stream=new PassThrough(),received=[];let rejected=0;
 readMessages(stream,value=>received.push(value),()=>rejected++,64);
 const first=Buffer.from(JSON.stringify({type:'title',value:'Dungeon Blítz'})+'\n');
 for(const byte of first)stream.write(Buffer.from([byte]));
 stream.write('{"type":"zoom","value":1}\n{"type":"mute","value":false}\n');
 assert.deepEqual(received.map(x=>x.type),['title','zoom','mute']);assert.equal(received[0].value,'Dungeon Blítz');
 stream.write(Buffer.alloc(65,65));assert.equal(rejected,1);
 stream.write('{"type":"quit"}\n');assert.equal(received.length,3);
});
test('malformed/nonobject commands, incomplete lines and asynchronous handler failures are rejected',async()=>{
 for(const body of ['null\n','[]\n','{"type":4}\n','broken\n','{"type":"quit"}']){
  const stream=new PassThrough();let rejected=0,received=0;readMessages(stream,()=>received++,()=>rejected++);
  stream.end(body);await new Promise(setImmediate);assert.equal(rejected,1);assert.equal(received,0);
 }
 const stream=new PassThrough();let rejected=0;readMessages(stream,async()=>{throw Error('rejected');},()=>rejected++);
 stream.write('{"type":"quit"}\n');await new Promise(setImmediate);assert.equal(rejected,1);
});
test('authentication rejection stops dispatching trailing messages already in the same chunk',()=>{
 const stream=new PassThrough();let count=0;
 readMessages(stream,()=>{count++;stream.destroy();});
 stream.write('{"type":"auth","token":"wrong"}\n{"type":"ready","hwnd":"123"}\n');assert.equal(count,1);
});
test('game/native process environment excludes secrets and production test switches',()=>{
 const source={SystemRoot:'C:/Windows',Path:'windows paths',APPDATA:'profile',TEMP:'temp',GITHUB_TOKEN:'dummy',OPENAI_API_KEY:'dummy',SSH_AUTH_SOCK:'dummy',NODE_OPTIONS:'dummy',BLITZ_HOST_TEST:'1',BLITZ_PRIVATE_DESKTOP:'BlitzTest-abcd'};
 assert.deepEqual(gameEnvironment(source),{SystemRoot:source.SystemRoot,Path:source.Path,APPDATA:source.APPDATA,TEMP:source.TEMP});
 assert.equal(gameEnvironment(source,true).BLITZ_PRIVATE_DESKTOP,'BlitzTest-abcd');
 assert.equal(gameEnvironment({...source,BLITZ_PRIVATE_DESKTOP:'Default'},true).BLITZ_PRIVATE_DESKTOP,undefined);
});
