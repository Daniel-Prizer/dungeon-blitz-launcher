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
  await call('save-settings',{cursorLock:true});await app.evaluate(()=>global.__blitzTest.runtime().focus());await wait(300);
  async function check(name){
   await app.evaluate(()=>{const g=global.__blitzTest.runtime();g.windowTest=null;g.testHost('TESTWINDOW');});
   const record=await until(()=>app.evaluate(()=>global.__blitzTest.runtime().windowTest));records.push({name,...record});
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records},null,2));
   assert.deepEqual(record.actual,record.expected,'Native game rectangle must match the launcher viewport');
   assert(record.dryRun,'Tests must never confine the physical cursor');assert(record.cursorAreaValid);
   const target=record.fullscreen?record.actual:record.launcherClient;
   const inset=Math.min(Math.round(12*record.cursorDpi/96),Math.max(0,Math.floor((Math.min(target.right-target.left,target.bottom-target.top)-1)/2)));
   assert.deepEqual(record.cursorArea,{left:target.left+inset,top:target.top+(record.fullscreen?inset:0),right:target.right-inset,bottom:target.bottom-inset});
   if(!record.fullscreen){
    const buttons=await page.locator('#titlebar button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}}));
    assert(buttons.length>=2);
    for(const button of buttons){const x=record.launcherClient.left+button.x*record.cursorDpi/96,y=record.launcherClient.top+button.y*record.cursorDpi/96;assert(x>=record.cursorArea.left&&x<record.cursorArea.right&&y>=record.cursorArea.top&&y<record.cursorArea.bottom,'Top-menu buttons must be reachable within cursor lock');}
   }
   for(const hit of record.hits){assert(hit.ok);assert.equal(hit.hit,1,`${name}: (${hit.x},${hit.y}) must be HTCLIENT, not resize/caption`);}
  }
  await check('windowed');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());await wait(250);await check('menu-focused');assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),true);assert(records.at(-1).menuAllowed,'Cursor lock must recognize the actual launcher HWND');assert(records.at(-1).gameAllowed);assert.equal(records.at(-1).externalAllowed,false);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await wait(300);await check('settings-open');assert.equal(records.at(-1).menuAllowed,false,'Settings must release cursor lock');assert.equal(records.at(-1).gameAllowed,false);
  await page.getByRole('button',{name:'Back to game'}).click();await wait(400);await check('menu-return');assert(records.at(-1).gameAllowed);
  const shown=records.at(-1).visibilityTransitions;await call('save-settings',{cursorLock:true});await wait(200);await check('unchanged-placement');assert.equal(records.at(-1).visibilityTransitions,shown,'Unchanged layout must not re-show the game HWND');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1680,850));await wait(1000);await check('resized');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const b=w.getBounds();w.setPosition(b.x+90,b.y+40);});await wait(600);await check('owner-moved');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize());await wait(800);await check('maximized');
  await call('fullscreen');await wait(800);await check('fullscreen');
  assert.equal(records.at(-1).nonRude,false,'Fullscreen notification must follow showing the game');
  await call('settings');await wait(300);await check('fullscreen-settings');assert.equal(records.at(-1).menuAllowed,false);
  await call('dismiss');await wait(600);await check('fullscreen-settings-return');assert.equal(records.at(-1).nonRude,false,'Returning to fullscreen must restore Shell classification');
  await call('exit-fullscreen');await wait(800);await check('fullscreen-exit');
  assert.equal(records.at(-1).nonRude,true);
  await call('settings');await wait(300);await call('dismiss');await wait(600);await check('settings-return');
  console.log('PASS Native placement/hit tests; menu buttons inside cursor bounds; owner focus remains locked; settings release; fullscreen retains game inset (dry run only)');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
