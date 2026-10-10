const {test}=require('node:test'),assert=require('node:assert/strict');
const {MountShortcut}=require('../src/legacy/mount-shortcut.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const down=(extra={})=>({type:'keyDown',code:'ShiftLeft',...extra}),up={type:'keyUp',code:'ShiftLeft'};
test('Left Shift mount alias is opt-in, repeat-safe and game-only, without queuing bursts',async()=>{
 let calls=0;const binding=new MountShortcut(async()=>{calls++;return true;});
 binding.input(down());binding.input(up);await tick();assert.equal(calls,0);
 binding.configure(true);binding.input(down());binding.input(down());binding.input(down({isAutoRepeat:true}));await tick();assert.equal(calls,1);
 binding.input(up);binding.input(down());await tick();assert.equal(calls,2);
 binding.input(up);for(const flag of ['control','alt','meta']){binding.input(down({[flag]:true}));binding.input(up);}
 binding.input(down({code:'ShiftRight'}));await tick();assert.equal(calls,2);
 binding.input(down());binding.reset();await tick();assert.equal(calls,2,'Focus/visibility reset cancels undispatched work');
 binding.input(down());binding.configure(false);await tick();assert.equal(calls,2,'Disabling cancels pending work');
 let finish;const slow=new MountShortcut(()=>{calls++;return new Promise(r=>finish=r);});slow.configure(true);
 slow.input(down());await tick();for(let i=0;i<10;i++){slow.input(up);slow.input(down());}await tick();assert.equal(calls,3);
 finish(false);await tick();slow.input(up);slow.input(down());await tick();assert.equal(calls,4);
 finish(false);await tick();
 const rejected=new MountShortcut(()=>Promise.reject(Error('gone')));rejected.configure(true);rejected.input(down());await tick();assert.equal(rejected.pending,false);
});
