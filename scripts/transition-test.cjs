'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/transition-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await wait(100);}throw Error('Transition check timed out');}
(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 let mode='fixed';
 const server=http.createServer((req,res)=>{
  if(req.url==='/DungeonBlitz.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/transition',mode+'.swf')));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}object{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/DungeonBlitz.swf"><param name="movie" value="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let app;const records=[];
 try{
  app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(name,value)=>page.evaluate(([name,value])=>window.blitz.action(name,value),[name,value]);
  const cmd=value=>app.evaluate(({},value)=>global.__blitzTest.nativeCommand(null,value),value);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1920,1112);w.showInactive();w.focus();});
  async function sample(name,image=false){
   const file=path.join(out,name+'.png');if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');if(image&&fs.existsSync(file))fs.unlinkSync(file);
   await cmd({type:image?'capture':'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json')&&(!image||fs.existsSync(file)));
   const record=JSON.parse(fs.readFileSync(file+'.json'));records.push({name,...record});return record;
  }
  for(mode of ['baseline','fixed']){
   await call('save-settings',{gameURL:'http://127.0.0.1:'+server.address().port+'/',gameZoom:1,cursorLock:false,renderResolution:1,showFPS:false,experimentalWidescreen:false});await call('restart-game');
   await until(async()=>!(await call('state')).loading);await wait(1200);await cmd({type:'test-transition-fixture'});await wait(1200);
   assert((await sample(mode+'-initialized')).renderProbe?.fixture,'Real AS3 fixture must initialize');
   for(const [width,height] of [[1920,1080],[2560,1440]]){
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),[width,height]);await wait(1000);
    // Force native resize to dispose the previous fade bitmap before each trial.
    await call('save-settings',{gameZoom:.75});await wait(500);await call('save-settings',{gameZoom:1});await wait(700);
    const before=(await sample(mode+'-'+width+'-before',true)).renderProbe;
    await cmd({type:'test-transition-control',play:false,transition:true});await wait(700);
    const after=(await sample(mode+'-'+width+'-after',true)).renderProbe;
    assert.equal(after.animationRate,before.animationRate);assert.equal(after.nativeScale,before.nativeScale);
    const pixel=await app.evaluate(({nativeImage},value)=>{
     const image=nativeImage.createFromPath(value.path),bitmap=image.toBitmap(),size=image.getSize();
     const offset=(Math.floor(size.height/2)*size.width+value.x)*4;return [...bitmap.subarray(offset,offset+4)];
    },{path:path.join(out,mode+'-'+width+'-after.png'),x:Math.floor((width-before.bitmapWidth)/2)+before.bitmapWidth+25});
    assert.deepEqual(pixel,mode==='baseline'?[101,112,96,255]:[85,73,72,255],'Right gray margin must not be overwritten by the transition canvas');
    if(mode==='baseline'){assert.equal(after.bitmapWidth,2048);assert.equal(after.bitmapHeight,1152);assert.notEqual(after.bitmapWidth,before.bitmapWidth);}
    else{assert.equal(after.bitmapWidth,before.bitmapWidth);assert.equal(after.bitmapHeight,before.bitmapHeight);}
   }
  }
  assert((await call('save-settings',{experimentalWidescreen:'true'})).error);
  await call('settings');const checkbox=page.getByRole('checkbox',{name:'Experimental 16:9',exact:true});assert.equal(await checkbox.isChecked(),false);
  await checkbox.check();await until(async()=>(await call('state')).settings.experimentalWidescreen);await call('dismiss');await wait(1100);
  assert.equal((await sample('wide-login')).renderProbe.widescreen.active,false,'Original menu art must not stretch');
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(1100);
  let p=(await sample('wide-play-1440p',true)).renderProbe;
  assert.equal(p.widescreen.active,true);assert(Math.abs(p.widescreen.logicalWidth/768-16/9)<1e-9);
  assert.equal(p.animationRate,30);assert.equal(p.widescreen.frameAttached,true);assert.equal(p.widescreen.frameInteractive,false);
  assert(Math.abs(p.fixture.left+(p.widescreen.logicalWidth-1152)/2)<.026);assert(Math.abs(p.fixture.right-(852+(p.widescreen.logicalWidth-1152)/2))<.026);
  assert.equal(p.fixture.edgeVisible,false);
  const half=(p.widescreen.logicalWidth-1152)/2;
  const left=p.fixture.left;
  for(let i=0;i<8;i++){await wait(80);assert.equal((await sample('no-drift-'+i)).renderProbe.fixture.left,left);}
  const startX=(p.stageWidth-p.widescreen.logicalWidth*p.nativeScale)/2,startY=(p.stageHeight-768*p.nativeScale)/2;
  for(const logical of [20,p.widescreen.logicalWidth/2,p.widescreen.logicalWidth-20]){
   await cmd({type:'test-input',input:{type:'mouseDown',x:Math.round(startX+logical*p.nativeScale),y:Math.round(startY+350*p.nativeScale),button:'left',clickCount:1}});
   await cmd({type:'test-input',input:{type:'mouseUp',x:Math.round(startX+logical*p.nativeScale),y:Math.round(startY+350*p.nativeScale),button:'left',clickCount:1}});await wait(100);
   const click=(await sample('input-'+Math.round(logical))).renderProbe.fixture;assert(Math.abs(click.mouseX-logical)<1.1);assert(Math.abs(click.mouseY-350)<1.1);assert.notEqual(click.target,'blitz-wide-frame');
  }
  for(const resolution of [.75,.5,1]){
   await call('save-settings',{renderResolution:resolution});await wait(1100);const before=(await sample('wide-resolution-'+resolution,true)).renderProbe;
   await cmd({type:'test-transition-control',play:true,transition:true});await wait(500);const after=(await sample('wide-transition-'+resolution,true)).renderProbe;
   assert.equal(after.bitmapWidth,before.bitmapWidth);assert.equal(after.bitmapHeight,before.bitmapHeight);assert.equal(after.animationRate,30);assert(after.bitmapWidth<=4096&&after.bitmapHeight<=2730);
  }
  for(const [width,height] of [[1920,1080],[2560,1440]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),[width,height]);await wait(800);
   for(const zoom of [.5,1,1.5,3]){
    await call('save-settings',{gameZoom:zoom});await wait(800);const wide=(await sample('wide-'+width+'-zoom-'+zoom,true)).renderProbe;
    assert(wide.widescreen.active);assert(wide.bitmapWidth<=4096&&wide.bitmapHeight<=2730);assert.equal(wide.animationRate,30);
    assert(Math.abs(wide.fixture.left+half)<.026);assert(Math.abs(wide.fixture.right-(852+half))<.026);
   }
  }
  await call('save-settings',{gameZoom:1});await wait(800);
  await call('fullscreen');await wait(800);assert((await sample('wide-fullscreen',true)).renderProbe.widescreen.active);
  await call('exit-fullscreen');await wait(800);
  await call('settings');await checkbox.uncheck();await until(async()=>!(await call('state')).settings.experimentalWidescreen);await call('dismiss');await wait(1000);
  p=(await sample('restored-original',true)).renderProbe;assert.equal(p.widescreen.logicalWidth,1152);assert.equal(p.fixture.left,0);assert.equal(p.fixture.right,852);assert.equal(p.fixture.edgeVisible,true);
  await call('save-settings',{experimentalWidescreen:true});await wait(1100);await cmd({type:'test-transition-control',play:false,transition:false});await wait(1000);
  assert.equal((await sample('return-to-menu',true)).renderProbe.widescreen.logicalWidth,1152);
  // An unmodified live title screen validates revision compatibility/menu art.
  await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',gameZoom:1,renderResolution:1});await call('restart-game');
  await until(async()=>!(await call('state')).loading&&(await call('state')).clientIntegration);await wait(5000);
  const live=await sample('live-title-wide-enabled',true);assert(live.renderProbe);assert.equal(live.renderProbe.widescreen.requested,true);assert.equal(live.renderProbe.widescreen.active,false);assert.equal(live.renderProbe.animationRate,100);
  await call('save-settings',{experimentalWidescreen:false});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records,limits:'Inactive desktop, synthetic play/HUD roots using real client layout/allocator/input methods; live unauthenticated title only. No authenticated combat, credentials, desktop switching or pointer confinement.'},null,2));
  console.log('PASS Actual transition allocator baseline reproduces fixed 2048x1152 mismatch; corrected dimensions match native view at 1080p/1440p');
  console.log('PASS Experimental setting defaults off, validates booleans, widens logical view to 16:9 only in play, preserves clocks and restores menu/HUD geometry');
  console.log('PASS Widescreen input coordinates at left/center/right, no HUD drift, click-through frame, 50/75/100% raster and transitions; live title unaffected');
 }finally{if(app){await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
