const test=require('node:test'),assert=require('node:assert/strict'),{AutorunShortcut}=require('../src/legacy/autorun-shortcut.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
test('Ö autorun is local, single-toggle, layout-aware and cancels pending work on blur/disable',async()=>{
 let toggles=0,stops=0;const key=new AutorunShortcut(()=>toggles++,()=>stops++),down=(keyName='ö',extra={})=>key.input({key:keyName,type:'keyDown',...extra});
 down();down();await flush();assert.equal(toggles,1);key.input({key:'ö',type:'keyUp'});down('Ö');await flush();assert.equal(toggles,2);
 for(const extra of [{control:true},{alt:true},{meta:true},{isAutoRepeat:true}]){key.input({key:'ö',type:'keyUp'});down('ö',extra);}await flush();assert.equal(toggles,2);
 key.input({key:'ö',type:'keyUp'});down('o');down('ö');key.reset();await flush();assert.equal(toggles,2);assert.equal(stops,1);
 key.configure(false);down();await flush();assert.equal(toggles,2);assert.equal(stops,2);
});

test('autorun binding validates keys, migrates Ö default and resets held/pending work on rebind',async()=>{
 const binding=require('../src/autorun-binding.js'),{validSettings}=require('../src/policy.cjs');
 assert.equal(validSettings({}).autorunKey,'ö');assert.equal(validSettings({autorunKey:'KeyR'}).autorunKey,'KeyR');
 for(const value of ['F11','Escape','ShiftLeft','ControlLeft','MetaLeft','KeyRR',{},null]){assert.equal(binding.valid(value),false);assert.equal(validSettings({autorunKey:value}).autorunKey,'ö');}
 assert.equal(binding.capture({key:'ö',code:'Semicolon'}),'ö');assert.equal(binding.capture({key:'r',code:'KeyR'}),'KeyR');assert.equal(binding.capture({key:'R',code:'KeyR',ctrlKey:true}),null);
 let toggles=0,stops=0;const key=new AutorunShortcut(()=>toggles++,()=>stops++);key.input({key:'ö',type:'keyDown'});key.configure(true,'KeyR');await flush();assert.equal(toggles,0);assert.equal(stops,1);
 key.input({key:'ö',code:'Semicolon',type:'keyDown'});await flush();assert.equal(toggles,0);
 key.input({key:'r',code:'KeyR',type:'keyDown'});key.input({key:'r',code:'KeyR',type:'keyDown',isAutoRepeat:true});await flush();assert.equal(toggles,1);
 key.input({code:'KeyR',type:'keyUp'});key.input({code:'KeyR',type:'keyDown',shift:true});await flush();assert.equal(toggles,1);
 key.configure(true,'ö');key.input({key:'Ö',type:'keyDown'});await flush();assert.equal(toggles,2);
});
