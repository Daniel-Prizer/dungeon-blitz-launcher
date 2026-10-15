'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const singleplayer=process.env.BLITZ_TEST_CLIENT==='singleplayer',root=path.resolve(__dirname,'..'),out=path.join(root,'docs/'+(singleplayer?'singleplayer-camera-tests':'camera-tests'));fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await wait(100);}throw Error('Transition check timed out');}
module.exports=(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 let mode='fixed';
 const server=http.createServer((req,res)=>{
  if(['/assets/UI_0.swf','/assets/UI_0_1.swf','/assets/UI_0_2.swf','/assets/UI_0_3.swf','/assets/UI_1.swf','/assets/UI_2.swf','/assets/UI_4.swf','/assets/UI_Library.swf','/assets/UI_Seasonal.swf','/assets/LevelsHome.swf','/assets/LevelsJC.swf','/assets/LevelsBT.swf','/assets/GlobalMap01.swf'].includes(req.url)){
   // The current client's controllers require current UI assets. Falling back
   // to the archived server checkout can silently test mismatched artwork.
   const assets=process.env.BLITZ_TEST_ASSET_DIR||path.join(root,'.test-tools/wide-live-assets');
   res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(assets,path.basename(req.url))));return;
  }
  if(req.url==='/DungeonBlitz.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/transition'+(singleplayer?'-singleplayer':''),mode+'.swf')));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}object{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/DungeonBlitz.swf"><param name="movie" value="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let app;const records=[],cameras=new Map(),following=new Map();
 try{
  app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(name,value)=>page.evaluate(([name,value])=>window.blitz.action(name,value),[name,value]);
  const cmd=value=>app.evaluate(({},value)=>global.__blitzTest.nativeCommand(null,value),value);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1920,1112);w.showInactive();w.focus();});
  async function sample(name,image=false){
   const file=path.join(out,name+'.png');if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');if(image&&fs.existsSync(file))fs.unlinkSync(file);
   await cmd({type:image?'capture':'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json')&&(!image||fs.existsSync(file)));
   // The native writer creates the file before completing it. Existence alone
   // races its JSON write, especially during rapid camera/transition sampling.
   let record;await until(()=>{try{record=JSON.parse(fs.readFileSync(file+'.json'));return true;}catch{return false;}});
   records.push({name,...record});return record;
  }

  for(mode of ['camera-baseline','fixed']){
   await call('save-settings',{gameURL:'http://localhost:'+server.address().port+'/',gameZoom:1,cursorLock:false,renderResolution:1,showFPS:false,experimentalWidescreen:true,centeredHotbar:false,centeredCamera:false});await call('restart-game');
   await until(async()=>!(await call('state')).loading);await wait(1800);await cmd({type:'test-transition-fixture'});await until(async()=>(await call('state')).clientIntegration===true);await wait(900);await cmd({type:'test-transition-control',play:true,transition:false});await wait(700);
   for(const [width,height] of [[1920,1080],[2560,1440]]){
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),[width,height]);await wait(500);
    for(let kind=0;kind<6;kind++){
     await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_CameraProbe'});await wait(120);
     const record=await sample(mode+'-'+width+'-'+kind,kind==0),probe=record.renderProbe.fixture.camera;
     assert(!probe.error,probe.error);assert.equal(record.renderProbe.animationRate,30,'Camera fixes preserve the fixture frame rate');
     cameras.set(mode+'-'+width+'-'+kind,probe);
     if(mode==='fixed'){
      const before=cameras.get('camera-baseline-'+width+'-'+kind);
      assert.equal(probe.x,before.x,'Horizontal camera and native smoothing stay intact');
      if(kind===0){assert.equal(before.y,480,'Original missed side probe reproduces the downward camera drop');assert.equal(probe.y,62,'Missed side ray must retain the real player floor');}
      else assert.equal(probe.y,before.y,'Valid/deeper floors, missing player floor, frozen and scripted cameras stay intact');
     }
    }
    for(let kind=0;kind<8;kind++){
     await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_FollowProbe'});
     const record=await sample(mode+'-follow-original-'+width+'-'+kind),probe=record.renderProbe.fixture.camera;
     assert(!probe.error,probe.error);assert.equal(probe.follow.length,900);
     following.set(mode+'-'+width+'-'+kind,probe);
     if(mode==='fixed')assert.deepEqual(probe,following.get('camera-baseline-'+width+'-'+kind),'Disabled follow reproduces every original camera sample, including frozen/scripted states');
    }
    if(mode==='fixed'){
     await call('save-settings',{centeredCamera:true});await wait(120);
     for(let kind=0;kind<8;kind++){
      await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_FollowProbe'});
      const record=await sample('follow-centered-'+width+'-'+kind),probe=record.renderProbe.fixture.camera;
      assert(record.renderProbe.centeredCamera);assert(!probe.error,probe.error);
      const native=following.get('fixed-'+width+'-'+kind);
      for(const [i,point]of probe.follow.entries()){
       assert(Number.isFinite(point.screen)&&Number.isFinite(point.target)&&Number.isFinite(point.render));
       assert.equal(point.y,native.follow[i].y,'Preserve the native vertical target');
       assert.equal(point.layerY,native.follow[i].layerY,'Preserve the native vertical easing');
       if(probe.roomWidth){assert(point.target>=-.001);assert(point.target<=probe.roomWidth-probe.width+.001);}
       if([0,1,5,6,7].includes(kind))assert(Math.abs(point.player-point.target-probe.width/2)<=probe.width*.061,'Horizontal target stays in the central band before native easing');
      }
      if(kind===2)for(const step of [199,649])assert(Math.abs(probe.follow[step].target-native.follow[step].target)<.001,'Keep original narrow-room endpoints within floating-point precision');
      if(kind===3||kind===4)assert.deepEqual(probe,native,'Frozen and scripted cameras retain every original sample');
      if(kind===7)assert(probe.follow.some(point=>point.easing>0),'Teleports retain native camera easing');
     }
     await call('save-settings',{centeredCamera:false});await wait(120);
    }
   }
   for(let kind=0;kind<2;kind++){
    await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_MapProbe'});await wait(500);
    const record=await sample(mode+'-map-'+kind,true),probe=record.renderProbe.fixture.map;assert(probe&&!probe.error,probe?.error);
    assert(Math.abs(probe.displayWidth-(mode==='fixed'?1152:1365.3333333333333))<1,'Original map and its hit regions must use the same authored width');
    if(mode==='fixed'&&kind===0){
     assert(Math.abs(probe.globalScale-1)<.005,'Global map raster uses the original artwork scale');
     assert(probe.target,'Native BridgeTown hit polygon must exist');
     const {x,y}=probe.target;
     await cmd({type:'test-input',input:{type:'mouseMove',x:Math.round(x),y:Math.round(y)}});await wait(250);
     await cmd({type:'test-input',input:{type:'mouseDown',x:Math.round(x),y:Math.round(y),button:'left',clickCount:1}});
     assert.equal((await sample('map-native-click')).renderProbe.fixture.map.click,probe.target.name,'Actual native input reaches the map polygon beneath its artwork');
     await cmd({type:'test-input',input:{type:'mouseUp',x:Math.round(x),y:Math.round(y),button:'left',clickCount:1}});
    }
   }
   await call('save-settings',{experimentalWidescreen:false});await wait(500);
   await cmd({type:'test-world-control',pan:0,scene:false,oldCoverage:false,art:'a_Room_CameraProbe'});await wait(100);
   const original=(await sample(mode+'-original-camera')).renderProbe.fixture.camera;cameras.set(mode+'-original',original);
   if(mode==='fixed')assert.deepEqual(original,cameras.get('camera-baseline-original'),'Original-width camera behavior stays byte-for-byte equivalent');
   for(let kind=0;kind<8;kind++){
    await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_FollowProbe'});
    const probe=(await sample(mode+'-follow-original-width-'+kind)).renderProbe.fixture.camera;assert(!probe.error,probe.error);
    following.set(mode+'-original-'+kind,probe);
    if(mode==='fixed')assert.deepEqual(probe,following.get('camera-baseline-original-'+kind),'Original-width disabled follow is identical to native');
   }
   if(mode==='fixed'){
    await call('save-settings',{centeredCamera:true});await wait(120);
    for(let kind=0;kind<8;kind++){
     await cmd({type:'test-world-control',pan:kind,scene:false,oldCoverage:false,art:'a_Room_FollowProbe'});
     const probe=(await sample('follow-centered-original-width-'+kind)).renderProbe.fixture.camera,native=following.get('fixed-original-'+kind);assert(!probe.error,probe.error);
     for(const [i,point]of probe.follow.entries()){
      assert(Number.isFinite(point.screen)&&Number.isFinite(point.target));assert.equal(point.y,native.follow[i].y);assert.equal(point.layerY,native.follow[i].layerY);
      if(probe.roomWidth){assert(point.target>=-.001);assert(point.target<=probe.roomWidth-probe.width+.001);}
      if([0,1,5,6,7].includes(kind))assert(Math.abs(point.player-point.target-probe.width/2)<=probe.width*.061);
     }
     if(kind===3||kind===4)assert.deepEqual(probe,native);
    }
    await call('save-settings',{centeredCamera:false});await wait(120);
   }
  }
  await call('save-settings',{experimentalWidescreen:true});await wait(500);
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(300);
  const wide=(await sample('xp-extended',true)).renderProbe;
  const dividers=wide.fixture.hudTree.children.filter(c=>c.name.startsWith('instance')&&c.y>=771&&c.y<=777&&c.width>6&&c.width<7&&c.height>10&&c.height<11).sort((a,b)=>a.x-b.x);
  assert.equal(dividers.length,4,'Keep all four native XP dividers');assert(dividers[3].x>430,'Dividers continue beyond the old bar end');
  const xp=wide.fixture.hudTree.children.find(c=>c.name==='am_XPBar'),cells=[xp.x,...dividers.map(c=>c.x),xp.x+xp.width*xp.scaleX];
  for(let i=1;i<cells.length;i++)assert(cells[i]-cells[i-1]>95&&cells[i]-cells[i-1]<120,'Five XP cells span the complete extended channel');
  for(const [width,height] of [[1920,1080],[2560,1440]])for(const density of [1,.75,.5]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),[width,height]);
   await call('save-settings',{renderResolution:density});await wait(500);
   const captured=await sample('hud-joins-'+width+'-'+density,true),first=captured.renderProbe.widescreen.hudRaster;
   assert(Math.abs(captured.renderProbe.nativeScale*captured.scale-wide.nativeScale*height/wide.stageHeight)<.02,'Actual rendered HUD keeps the full fitted picture size across density changes');
   assert(first.width>0&&first.height>0);assert(first.width<=8191&&first.width*first.height<=8388608,'HUD artwork obeys the raster budget');
   await wait(300);const next=(await sample('hud-cache-'+width+'-'+density)).renderProbe.widescreen.hudRaster;
   assert.equal(next.builds,first.builds,'HUD artwork must remain cached while frames and meters update');
  }
  await call('save-settings',{renderResolution:1});await wait(300);
  await call('settings');await page.getByRole('tab',{name:'Display',exact:true}).click();
  const follow=page.getByRole('checkbox',{name:'Centered camera',exact:true});assert.equal(await follow.isChecked(),false);
  await follow.check();await page.locator('#save-settings').click();await until(async()=>(await call('state')).settings.centeredCamera);await call('dismiss');await wait(200);
  assert((await sample('follow-setting-enabled')).renderProbe.centeredCamera,'Actual checkbox reaches the game helper');
  await call('restart-game');await until(async()=>!(await call('state')).loading);await wait(1800);await cmd({type:'test-transition-fixture'});await until(async()=>(await call('state')).clientIntegration===true);await wait(400);
  assert((await sample('follow-setting-reloaded')).renderProbe.centeredCamera,'Reconnect reapplies the saved follow setting');
  await call('settings');await follow.uncheck();await page.locator('#save-settings').click();await until(async()=>!(await call('state')).settings.centeredCamera);await call('dismiss');await wait(200);
  assert.equal((await sample('follow-setting-disabled')).renderProbe.centeredCamera,false);
  assert((await call('save-settings',{centeredCamera:'yes'})).error,'Reject malformed camera settings');
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(300);
  await call('settings');
  const centered=page.getByRole('checkbox',{name:'Original centered hotbar',exact:true});assert.equal(await centered.isChecked(),false);
  await centered.check();await page.locator('#save-settings').click();await until(async()=>(await call('state')).settings.centeredHotbar);await call('dismiss');await wait(500);
  const old=(await sample('original-centered-hotbar',true)).renderProbe,half=(old.widescreen.logicalWidth-1152)/2;
  assert.equal(old.widescreen.active,true);assert.equal(old.widescreen.centeredHotbar,true);
  for(const field of ['hotbar','chat','quest'])assert(Math.abs(old.fixture[field]-half)<.1,'All original bottom panels share one centered origin: '+field);
  const oldHud=old.fixture.hudTree.children;assert(!oldHud.some(c=>c.name==='blitz-companion-frame'),'Original option restores native companion slots');
  const oldXP=oldHud.find(c=>c.name==='am_XPBar');assert(Math.abs(oldXP.width*oldXP.scaleX-402.4)<1,'Original option restores the compact XP width');
  assert(Math.abs(old.fixture.right-half*2)<.1,'Top-right counters keep the wider frame within Flash twip rounding');
  await call('settings');await centered.uncheck();await page.locator('#save-settings').click();await until(async()=>!(await call('state')).settings.centeredHotbar);await call('dismiss');await wait(500);
  const restored=(await sample('wide-hotbar-restored',true)).renderProbe;assert.equal(restored.fixture.hotbar,0);assert(Math.abs(restored.fixture.chat-half*2)<.1);
  assert(Math.abs(restored.fixture.hudTree.children.find(c=>c.name==='am_XPBar').width*restored.fixture.hudTree.children.find(c=>c.name==='am_XPBar').scaleX-548.5)<1);
  assert((await call('save-settings',{centeredHotbar:'yes'})).error,'Reject malformed hotbar setting');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records,limits:'Owned offline fixture on inactive desktop. Actual Camera/CollisionManager and original current map artwork/controllers, no account, gameplay, cursor confinement or OS input.'},null,2));
  console.log('PASS Native camera regression reproduced and fixed at 1080p/1440p; valid/deeper floors, scripted/frozen cameras and original layout preserved');
  console.log('PASS Original map raster/hit-region alignment, native map click, extended XP dividers, bounded/cached HUD artwork at all densities, and actual centered-hotbar checkbox/restoration');
  console.log('PASS Centered camera at 1080p/1440p: native off-mode equivalence, central band, room bounds, direction changes, vertical jumps, teleport easing, frozen/scripted states and saved checkbox/reconnect');
 }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
