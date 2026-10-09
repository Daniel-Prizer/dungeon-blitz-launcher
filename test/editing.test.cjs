const test=require('node:test'),assert=require('node:assert/strict');
const {editingCommand,pasteIntoFlash}=require('../src/legacy/editing.cjs');
test('native game paste shortcuts preserve ordinary typing and Flash selection commands',()=>{
  const input=(key,extra={})=>({type:'keyDown',key,...extra});
  for(const key of ['a','v','x','ArrowLeft','Tab','1'])assert.equal(editingCommand(input(key)),null);
  for(const key of ['a','c','x','z','y'])assert.equal(editingCommand(input(key,{control:true})),null);
  assert.equal(editingCommand(input('v',{control:true})),'paste');
  assert.equal(editingCommand(input('V',{control:true,shift:true})),'paste');
  assert.equal(editingCommand(input('Insert',{shift:true})),'paste');
  assert.equal(editingCommand(input('z',{control:true,shift:true})),null);
  assert.equal(editingCommand(input('v',{control:true,alt:true})),null,'AltGr typing must not trigger paste');
  assert.equal(editingCommand(input('v',{control:true,type:'keyUp'})),null,'Key release must not paste twice');
});
test('paste handles Unicode, strips control keys and does not carry Ctrl into typed characters',()=>{
  const events=[];let reads=0;
  pasteIntoFlash({sendInputEvent:event=>events.push(event)},()=>{reads++;return ' AæЖ🙂\r\nB\t\u0000';});
  assert.equal(reads,1);
  assert.equal(events.filter(event=>event.type==='char').map(event=>event.keyCode).join(''),' AæЖ🙂B');
  assert(events.every(event=>event.modifiers.length===0));
  for(let i=0;i<events.length;i+=3)assert.deepEqual(events.slice(i,i+3).map(event=>event.type),['keyDown','char','keyUp']);
  assert(events.some(event=>event.keyCode==='🙂'),'Surrogate pairs must stay together');
});
