const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/window-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<120;i++){const v=await fn();if(v)return v;await wait(100);}throw new Error('Window check timed out');}
(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env}),records=[];
 try {
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(n,v)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[n,v]);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.focus();});
  await until(()=>app.evaluate(()=>!!global.__blitzTest.runtime().host));await wait(1500);
  async function check(name){
   await app.evaluate(()=>{const g=global.__blitzTest.runtime();g.windowTest=null;g.testHost('TESTWINDOW');});
   const record=await until(()=>app.evaluate(()=>global.__blitzTest.runtime().windowTest));records.push({name,...record});
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records},null,2));
   assert.deepEqual(record.actual,record.expected,'Native game rectangle must match the launcher viewport');
   for(const hit of record.hits){assert(hit.ok);assert.equal(hit.hit,1,`${name}: (${hit.x},${hit.y}) must be HTCLIENT, not resize/caption`);}
  }
  await check('windowed');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1680,850));await wait(1000);await check('resized');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const b=w.getBounds();w.setPosition(b.x+90,b.y+40);});await wait(600);await check('owner-moved');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize());await wait(800);await check('maximized');
  await call('fullscreen');await wait(800);await check('fullscreen');
  await call('exit-fullscreen');await wait(800);await check('fullscreen-exit');
  await call('settings');await wait(300);await call('dismiss');await wait(600);await check('settings-return');
  console.log('PASS Actual Windows HTCLIENT at all game edges/corners; exact game placement after owner resize/move/maximize/fullscreen/settings');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
