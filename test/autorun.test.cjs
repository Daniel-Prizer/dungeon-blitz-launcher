const test=require('node:test'),assert=require('node:assert/strict'),{AutorunShortcut}=require('../src/legacy/autorun-shortcut.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
test('Ö autorun is local, single-toggle, layout-aware and cancels pending work on blur/disable',async()=>{
 let toggles=0,stops=0;const key=new AutorunShortcut(()=>toggles++,()=>stops++),down=(keyName='ö',extra={})=>key.input({key:keyName,type:'keyDown',...extra});
 down();down();await flush();assert.equal(toggles,1);key.input({key:'ö',type:'keyUp'});down('Ö');await flush();assert.equal(toggles,2);
 for(const extra of [{control:true},{alt:true},{meta:true},{isAutoRepeat:true}]){key.input({key:'ö',type:'keyUp'});down('ö',extra);}await flush();assert.equal(toggles,2);
 key.input({key:'ö',type:'keyUp'});down('o');down('ö');key.reset();await flush();assert.equal(toggles,2);assert.equal(stops,1);
 key.configure(false);down();await flush();assert.equal(toggles,2);assert.equal(stops,2);
});
