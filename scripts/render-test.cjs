const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/render-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){const v=await fn();if(v)return v;await wait(100);}throw Error('Rendering check timed out');}
(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env}),records=[];
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(n,v)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[n,v]);
  const cmd=value=>app.evaluate(({},value)=>global.__blitzTest.nativeCommand(null,value),value);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.focus();});
  await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',gameZoom:1,cursorLock:false,renderResolution:1,showFPS:true});await call('restart-game');
  await until(async()=>!(await call('state')).loading&&(await call('state')).clientIntegration);await wait(5000);
  async function capture(name){
   const file=path.join(out,name+'.png');if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');
   if(fs.existsSync(file))fs.unlinkSync(file);
   await cmd({type:'capture',path:file});await until(()=>fs.existsSync(file+'.json')&&fs.existsSync(file));
   const record=JSON.parse(fs.readFileSync(file+'.json'));assert(record.renderProbe,'Real native rendering adapter must be initialized');
   assert(fs.statSync(file).size>100000,'A detailed real game image must render');return {name,...record};
  }
  async function responsiveness(name){
   const file=path.join(out,name+'-probe'),samples=[];
   for(let i=0;i<24;i++){
    if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');await cmd({type:'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json'));
    const sample=JSON.parse(fs.readFileSync(file+'.json'));assert(Number.isFinite(sample.probeDurationMs));samples.push(sample.probeDurationMs);await wait(15);
   }
   samples.sort((a,b)=>a-b);return{samples:24,medianMs:samples[12],p95Ms:samples[22],maxMs:samples[23],meaning:'Three renderer/Flash diagnostic calls on the unauthenticated title screen; not input latency, combat FPS or server round-trip time'};
  }
  for(const [width,height] of [[1920,1080],[2560,1440]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),[width,height]);await wait(1500);
   await cmd({type:'test-rendering-mode',value:'old'});await wait(2000);const old=await capture(width+'-old');
   old.responsiveness=await responsiveness(width+'-old');
   await cmd({type:'test-rendering-mode',value:'native'});await wait(2000);const native=await capture(width+'-native');
   native.responsiveness=await responsiveness(width+'-native');
   assert.equal(native.scale,1,'At 100% Windows DPI normal game rendering must use no browser magnification');
   assert.equal(native.renderProbe.stageWidth,width);assert.equal(native.renderProbe.stageHeight,height);
   assert(native.renderProbe.bitmapWidth>old.renderProbe.bitmapWidth*1.35,'The game itself must allocate more raster pixels');
   assert(native.renderProbe.bitmapHeight>old.renderProbe.bitmapHeight*1.35);
   assert.equal(native.renderProbe.animationRate,old.renderProbe.animationRate,'Animation clock must stay unchanged');
   assert(native.focused&&native.contentFocused);records.push({width,height,old,native});
   console.log('Native raster',JSON.stringify({width,height,old:old.renderProbe,native:native.renderProbe}));
   console.log('Title-screen diagnostic timings',JSON.stringify({width,old:old.responsiveness,native:native.responsiveness}));
   for(const resolution of [.75,.5,1]){
    await call('settings');await page.locator('#render-resolution').selectOption(String(resolution));
    await until(async()=>(await call('state')).settings.renderResolution===resolution);await call('dismiss');await wait(2400);
    const reduced=await capture(width+'-detail-'+resolution),probe=reduced.renderProbe;
    assert.equal(reduced.renderResolution,resolution);assert.equal(probe.animationRate,100);
    assert(Math.abs(probe.nativeScale*reduced.scale-native.renderProbe.nativeScale)<.025,'Picture size must remain constant when raster resolution changes');
    assert(Math.abs(probe.bitmapWidth/native.renderProbe.bitmapWidth-resolution)<.015);
    assert(Math.abs(probe.bitmapHeight/native.renderProbe.bitmapHeight-resolution)<.015);
    assert.equal(probe.frameCounter.visible,true,'FPS counter must still fit in the physical gray margin');
    assert(Math.abs(probe.frameCounter.width*reduced.scale-native.renderProbe.frameCounter.width)<.01,'Counter keeps its physical size');
    assert(reduced.focused&&reduced.contentFocused);const samples=[];
    for(let repeat=0;repeat<3;repeat++){await wait(1100);const p=await capture(width+'-detail-'+resolution+'-fps-'+repeat);samples.push(p.renderProbe.frameCounter.fps);}
    records.push({width,height,resolution,record:reduced,titleFrameSamples:samples});
    console.log('Render resolution',JSON.stringify({width,resolution,bitmapWidth:probe.bitmapWidth,bitmapHeight:probe.bitmapHeight,displayedScale:probe.nativeScale*reduced.scale,measuredTitleFPS:samples}));
   }
  }
  for(const zoom of [.5,.75,1,1.5,3]){
   await call('save-settings',{gameZoom:zoom});await wait(1500);const r=await capture('zoom-'+zoom);
   assert.equal(r.renderProbe.zoom,zoom);assert(r.renderProbe.bitmapWidth<=4096&&r.renderProbe.bitmapHeight<=2730,'Raster allocation must remain bounded');
   records.push({zoom,record:r});
  }
  await call('save-settings',{gameZoom:1});await call('fullscreen');await wait(1000);records.push({fullscreen:await capture('fullscreen')});
  await call('exit-fullscreen');await call('settings');await call('dismiss');await wait(1000);const restored=await capture('restored');assert(restored.focused&&restored.contentFocused);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records,restored},null,2));
  console.log('PASS Live native raster resolution at 1080p/1440p, unchanged animation rate, bounded zoom, fullscreen and focus');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
