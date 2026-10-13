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
  if(['/assets/UI_0.swf','/assets/UI_0_1.swf','/assets/UI_0_2.swf','/assets/UI_0_3.swf','/assets/UI_1.swf','/assets/UI_2.swf','/assets/UI_4.swf','/assets/UI_Library.swf','/assets/UI_Seasonal.swf','/assets/LevelsHome.swf','/assets/LevelsJC.swf','/assets/LevelsBT.swf','/assets/GlobalMap01.swf'].includes(req.url)){
   // The current client's controllers require current UI assets. Falling back
   // to the archived server checkout can silently test mismatched artwork.
   const assets=process.env.BLITZ_TEST_ASSET_DIR||path.join(root,'.test-tools/wide-live-assets');
   res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(assets,path.basename(req.url))));return;
  }
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
   // The native writer creates the file before completing it. Existence alone
   // races its JSON write, especially during rapid camera/transition sampling.
   let record;await until(()=>{try{record=JSON.parse(fs.readFileSync(file+'.json'));return true;}catch{return false;}});
   records.push({name,...record});return record;
  }
  for(mode of ['baseline','fixed']){
   await call('save-settings',{gameURL:'http://localhost:'+server.address().port+'/',gameZoom:1,cursorLock:false,renderResolution:1,showFPS:false,experimentalWidescreen:false});await call('restart-game');
   await until(async()=>!(await call('state')).loading);await wait(1200);await cmd({type:'test-transition-fixture'});await wait(1200);
   const initialized=(await sample(mode+'-initialized')).renderProbe?.fixture;
   assert(initialized,'Real AS3 fixture must initialize');
   assert.equal(initialized.labels.length,5);
   assert(initialized.labels.every(item=>!item.error));
   if(mode==='baseline')assert(initialized.labels.some(item=>Math.abs(item.errorX)>5||Math.abs(item.errorY)>5),'Original raster crop must reproduce shifted real NPC text');
   else assert(initialized.labels.every(item=>item.errorX===0&&item.errorY===0),'Native cached NPC text must match vector position at every tested scale');
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
  mode='cache-baseline';
  await call('save-settings',{gameURL:'http://localhost:'+server.address().port+'/',gameZoom:1,renderResolution:1,experimentalWidescreen:true});await call('restart-game');
  await until(async()=>!(await call('state')).loading);await wait(1600);await cmd({type:'test-transition-fixture'});await wait(900);
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(600);
  await cmd({type:'test-world-control',pan:250,scene:false,oldCoverage:false});await wait(1200);
  const badCache=(await sample('cache-baseline',true)).renderProbe.fixture;
  assert.equal(badCache.worldError,'');assert(badCache.worldFrames>=5);assert.equal(badCache.cacheRebuilds,badCache.worldFrames,'Original fractional check must reproduce a cache rebuild every rendered frame');
  mode='reuse-baseline';await call('restart-game');await until(async()=>!(await call('state')).loading);await wait(1800);await cmd({type:'test-transition-fixture'});await wait(900);await cmd({type:'test-transition-control',play:true,transition:false});await wait(600);
  await cmd({type:'test-world-control',pan:0,vertical:2000,scene:false,oldCoverage:false,tiedTime:true});await wait(400);
  for(let step=1;step<=20;step++){await cmd({type:'test-world-control',pan:Math.min(23000,step*1151.7),vertical:2000,scene:false,oldCoverage:false,reuse:true,tiedTime:true});await wait(60);}
  const badReuse=(await sample('tile-reuse-baseline',true)).renderProbe.fixture;
  assert.equal(badReuse.pan,23000);assert.equal(badReuse.vertical,2000);assert.equal(badReuse.tiedTime,true);assert.equal(badReuse.worldError,'');assert(badReuse.pixelErrors>0,'Original narrow protection must reproduce visible corruption with tied LRU timestamps');
  mode='fixed';
  await call('save-settings',{experimentalWidescreen:false});await call('restart-game');
  await until(async()=>!(await call('state')).loading);await wait(1600);await cmd({type:'test-transition-fixture'});await wait(900);
  assert((await call('save-settings',{experimentalWidescreen:'true'})).error);
  await call('settings');await page.getByRole('tab',{name:'Display',exact:true}).click();const checkbox=page.getByRole('checkbox',{name:'Experimental 16:9',exact:true});assert.equal(await checkbox.isChecked(),false);
  await checkbox.check();await until(async()=>(await call('state')).settings.experimentalWidescreen);await call('dismiss');await wait(1100);
  const originalUI=(await sample('wide-login')).renderProbe;assert.equal(originalUI.widescreen.active,false,'Original menu art must not stretch');
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(1100);
  let p=(await sample('wide-play-1440p',true)).renderProbe;
  assert.equal(p.widescreen.active,true);assert(Math.abs(p.widescreen.logicalWidth/768-16/9)<1e-9);
  assert.equal(p.animationRate,30);assert.equal(p.widescreen.frameAttached,true);assert.equal(p.widescreen.frameInteractive,false);
  assert.equal(p.widescreen.frameStyle,'original-vector-three-slice');
  assert.equal(p.widescreen.decorationAnimating,false,'Decorative clones must not run uncontrolled child timelines');
  assert.equal(p.fixture.left,0);assert(Math.abs(p.fixture.right-(p.widescreen.logicalWidth-1152))<.051);
  assert.equal(p.widescreen.uiOffset,0);assert.equal(p.fixture.hotbar,0);assert.equal(p.fixture.nameX,600);assert.equal(p.fixture.party,174);
  assert(Math.abs(p.fixture.chat-(p.widescreen.logicalWidth-1152))<.051);assert.equal(p.fixture.quest,154.5);
  assert.equal(p.fixture.questTree.children.find(item=>item.name==='am_QuestName').scaleX,1,'Widen text fields without stretching fonts');
  assert.equal(p.fixture.questTree.children.find(item=>item.name==='am_InitialMapCover').scaleX,1,'Map label must preserve native proportions');
  assert.equal(p.fixture.questTree.children.find(item=>item.name==='am_ContactMatte').scaleX,1,'Widen only the contact shape, never the tooltip group');
  assert.equal(p.fixture.edgeVisible,false);
  const half=(p.widescreen.logicalWidth-1152)/2;
  const originalEvent=originalUI.presentation.games[0].news.children;
  const wideEvent=p.presentation.games[0].news.children;
  for(const name of ['am_HallowsEveBadge','am_HallowsEveKeys','am_Title'])assert(Math.abs(wideEvent.find(c=>c.name===name).x-originalEvent.find(c=>c.name===name).x-half*2)<.051,'Seasonal event controls anchor right independently');
  assert.equal(wideEvent.find(c=>c.name==='am_IconHolder').x,originalEvent.find(c=>c.name==='am_IconHolder').x,'Studio/news icon retains its left anchor');
  const left=p.fixture.left;
  for(let i=0;i<8;i++){
   await cmd({type:'test-transition-control',play:true,transition:false});await wait(80);
   const stable=(await sample('no-drift-'+i)).renderProbe.fixture;
   assert.equal(stable.left,left);
   assert(Math.abs(stable.questTree.children.find(c=>c.name==='am_CacheIcon').width-240)<2,'Re-caching must preserve the original quest cache within native raster rounding');
  }
  const startX=(p.stageWidth-p.widescreen.logicalWidth*p.nativeScale)/2,startY=(p.stageHeight-768*p.nativeScale)/2;
  const hudGap=await app.evaluate(({nativeImage},v)=>{
   const im=nativeImage.createFromPath(v.file),bytes=im.toBitmap(),w=im.getSize().width,n=(v.y*w+v.x)*4;
   return Array.from(bytes.subarray(n,n+4));
  },{file:path.join(out,'wide-play-1440p.png'),x:Math.round(startX+637*p.nativeScale),y:Math.round(startY+779*p.nativeScale)});
  assert.equal(hudGap[3],255);assert.notDeepEqual(hudGap,[85,73,72,255],'Shared quest/utility panel must cover spacing with its native backing');
  const hud=p.fixture.hudTree.children;
  const xpBar=hud.find(c=>c.name==='am_XPBar');assert(Math.abs(xpBar.width*xpBar.scaleX-548.5)<1,'XP continues beneath the full companion ornament');
  const companion=hud.find(c=>c.name==='blitz-companion-frame').children.find(c=>c.type==='flash.display::Bitmap');assert(companion.x>=441&&companion.x+companion.width*companion.scaleX<439.25+p.fixture.quest,'Companion ornament must clear both the ability recess and quest panel');
  const companionLip=hud.find(c=>c.name==='blitz-companion-frame').children.find(c=>c.name==='blitz-companion-lower-lip');assert(companionLip&&companionLip.height<=4,'Companion underside must be a slim bevel including its one-pixel Flash stroke, not another meter');
  const powerButtons=hud.find(c=>c.name==='am_PowerButtons').children;
  const buttonWidth=c=>c.width*c.scaleX;assert(Math.abs(buttonWidth(powerButtons[6])-buttonWidth(powerButtons[0]))<1&&Math.abs(buttonWidth(powerButtons[7])-buttonWidth(powerButtons[0]))<1,'Pet and mount match native ability size');
  assert.equal(powerButtons[6].y,0);assert.equal(powerButtons[7].y,0);
  const utility=p.fixture.topTree.children.find(c=>c.name==='am_Inventory');
  assert(utility.y>747&&utility.y<748,'Utilities clear the quest progress line');
  await cmd({type:'test-transition-control',play:true,transition:false,menu:'no-direction'});await wait(150);
  const noDirectionUI=(await sample('wide-direction-placeholder',true)).renderProbe.fixture;
  const noDirection=noDirectionUI.questTree.children;
  const dash=noDirection.find(c=>c.name==='blitz-direction-placeholder');
  assert.equal(dash.visible,true);
  const rowFaces=[{left:noDirectionUI.quest+dash.x+dash.bx*dash.scaleX,width:dash.width*dash.scaleX}];
  for(const name of ['am_Inventory','am_GoHome','am_Sigil','am_Spellbook','am_Social']){
    const button=noDirectionUI.topTree.children.find(c=>c.name===name),face=button.children.find(c=>c.name==='am_CacheIcon');
    rowFaces.push({left:button.x+(face.x+face.bx*face.scaleX)*button.scaleX,width:face.width*face.scaleX*button.scaleX});
  }
  const rowGaps=rowFaces.slice(1).map((face,i)=>face.left-rowFaces[i].left-rowFaces[i].width);
  assert(Math.max(...rowGaps)-Math.min(...rowGaps)<.15,'Direction placeholder and five native button faces must have equal visible spacing; tooltips must not affect the row');
  const beforeResource=hud.find(c=>c.name==='am_ManaBar').width;
  await call('save-settings',{shiftMount:true});await wait(1200);
  const shortcut=(await sample('wide-shift-mount',true)).renderProbe.fixture;
  assert.equal(shortcut.mountLabel,'L Shift');assert(shortcut.mountTextWidth<shortcut.mountLabelWidth-2,'Mount key hint must fit without clipping');
  assert.equal(shortcut.hudTree.children.find(c=>c.name==='am_ManaBar').width,beforeResource,'Resource bars remain unchanged');
  await call('save-settings',{shiftMount:false});await wait(500);assert.equal((await sample('wide-original-mount-label')).renderProbe.fixture.mountLabel,'8');
  for(const menu of ['idols','trove']){
   await cmd({type:'test-transition-control',play:true,transition:false,menu});await wait(350);const shown=(await sample('wide-menu-'+menu,true)).renderProbe.fixture;
   assert.equal(shown.idolsVisible,menu==='idols');assert.equal(shown.troveVisible,menu==='trove');assert(shown[menu].x<2);assert(shown[menu].x+shown[menu].width>p.widescreen.logicalWidth-2,'Original menu matte must cover the entire widened view');assert(Math.abs(shown.idolPanelWidth-originalUI.fixture.idolPanelWidth)<.061);assert(Math.abs(shown.trovePedestalWidth-originalUI.fixture.trovePedestalWidth)<.061,'Widening a matte must not stretch the trove pedestal artwork');
   const cornerBrightness=await app.evaluate(({nativeImage},v)=>{
    const sums=file=>{const im=nativeImage.createFromPath(file),bytes=im.toBitmap(),w=im.getSize().width;return v.points.map(([x,y])=>{const n=(y*w+x)*4;return bytes[n]+bytes[n+1]+bytes[n+2];});};
    return {before:sums(v.before),after:sums(v.after)};
   },{before:path.join(out,'wide-play-1440p.png'),after:path.join(out,'wide-menu-'+menu+'.png'),points:[[60,80],[p.widescreen.logicalWidth-60,400]].map(([x,y])=>[Math.round(startX+x*p.nativeScale),Math.round(startY+y*p.nativeScale)])});
   cornerBrightness.after.forEach((value,i)=>assert(value<cornerBrightness.before[i]*.85,'Both rendered outer corners must actually dim when a menu opens'));
  }
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
  for(const menu of ['barn','tome','social']){
   await cmd({type:'test-transition-control',play:true,transition:false,menu});await wait(350);
   const inspectionRecord=(await sample('wide-menu-'+menu,true)).renderProbe;
   const shown=inspectionRecord.fixture;
   if(menu==='social'){const panel=shown.social.children.find(c=>c.name==='am_ZonePanel');assert(panel);assert(Math.abs(shown.social.x+(panel.x+(panel.bx+panel.width/2)*panel.scaleX)*shown.social.scaleX-p.widescreen.logicalWidth/2)<.1,'Social panel must center its persistent panel rather than hidden tabs/popups');}
   if(menu!=='social'){
    assert.equal(inspectionRecord.widescreen.hudRaster.inspection,true,'Passive HUD plate must match the current inspection mode');
    assert.equal(shown.hudTree.children.find(c=>c.name==='blitz-companion-frame').visible,false,'Upgrade strips must hide the companion decoration without leaving gold fragments');
    assert.equal(shown.hudTree.children.find(c=>c.name==='am_PowerButtons').visible,false,'Building strips must leave no partial companion buttons or active hit fragments');
    for(const name of ['am_HPBar','am_HPText','am_LevelText','am_ManaBar','am_ClassManaBar','am_ManaText','am_ClassManaText','am_XPBar','am_XPContact'])assert.equal(shown.hudTree.children.find(c=>c.name===name).visible,false,'Building inspection replaces the complete combat/XP panel: '+name);
   }else for(const name of ['am_PowerButtons','am_HPBar','am_HPText','am_LevelText','am_ManaBar','am_ClassManaBar','am_ManaText','am_ClassManaText','am_XPBar','am_XPContact'])assert.equal(shown.hudTree.children.find(c=>c.name===name).visible,true,'The native combat HUD restores when a building strip closes: '+name);
   const strip=shown.barn.children.find(item=>item.name==='am_GlobalUpgradePanel');
   assert(strip);assert(Math.abs(strip.x+shown.barn.x)<.2,'Mixed building upgrade strip must start at the left edge of the HUD');
   if(menu!=='social')assert(Math.abs(shown.quest-Math.max(154.5,10+strip.width-439.25))<.1,'Quest must retain padding beside the actual building strip');
   else assert.equal(shown.quest,154.5);
  }
  for(const menu of ['store','settings']){
   await cmd({type:'test-transition-control',play:true,transition:false,menu});await wait(350);
   const shown=(await sample('wide-menu-'+menu,true)).renderProbe.fixture;
   const root=shown[menu],panel=root.children.find(c=>c.name===(menu==='store'?'am_Panel':'am_MenuWrapper'));
   assert(panel,'Actual native menu panel must exist');
   if(menu==='store'){assert(Math.abs(root.x-half)<.1,'On-demand native store must receive the same centered offset as the native book');continue;}
   const center=root.x+(panel.x+(panel.bx+panel.width/2)*panel.scaleX)*root.scaleX;
   assert(Math.abs(center-p.widescreen.logicalWidth/2)<1,'Native '+menu+' panel must center without moving the shared root');
  }
  await cmd({type:'test-transition-control',play:true,transition:false,menu:'companion-commands'});await wait(350);
  const commands=(await sample('wide-companion-commands',true)).renderProbe.fixture.commandIcons;
  assert.equal(commands.length,2);
  for(const icon of commands){assert(Math.abs(icon.x-2)<.16&&Math.abs(icon.y-2)<.16&&Math.abs(icon.width-44)<.16&&Math.abs(icon.height-44)<.16,'Native dismiss/dismount artwork must fill the companion inset within Flash twip quantization');}
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
  await cmd({type:'test-transition-control',play:true,transition:false,menu:'map'});await wait(350);
  const mapCover=(await sample('wide-map-cover',true)).renderProbe.fixture.questTree.children.find(item=>item.name==='am_InitialMapCover');
  assert.equal(mapCover.visible,true);assert.equal(mapCover.scaleX,1);assert.equal(mapCover.scaleY,1);
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
  await cmd({type:'test-transition-control',play:true,transition:true,transfer:true});
  for(let i=0;i<10;i++){
   await wait(60);const transferring=(await sample('actual-transfer-'+i)).renderProbe;
   assert.equal(transferring.widescreen.logicalWidth,p.widescreen.logicalWidth,'A pending login Game cannot narrow the active transfer frame');
   assert.equal(transferring.widescreen.active,true);
  }
  for(const phase of ['Login','None','Transfer']){
   await cmd({type:'test-transition-control',play:false,transition:true,phase});await wait(150);
   const loading=(await sample('loading-phase-'+phase,true)).renderProbe;
   assert.equal(loading.widescreen.logicalWidth,p.widescreen.logicalWidth,'Every live loading phase must preserve the wide frame');
   assert.equal(loading.widescreen.active,true);
  }
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
  for(const logical of [20,p.widescreen.logicalWidth/2,p.widescreen.logicalWidth-20]){
   await cmd({type:'test-input',input:{type:'mouseDown',x:Math.round(startX+logical*p.nativeScale),y:Math.round(startY+350*p.nativeScale),button:'left',clickCount:1}});
   await cmd({type:'test-input',input:{type:'mouseUp',x:Math.round(startX+logical*p.nativeScale),y:Math.round(startY+350*p.nativeScale),button:'left',clickCount:1}});await wait(100);
   const click=(await sample('input-'+Math.round(logical))).renderProbe.fixture;assert(Math.abs(click.mouseX-logical)<1.1);assert(Math.abs(click.mouseY-350)<1.1);assert.notEqual(click.target,'blitz-wide-frame');
  }
  await call('save-settings',{renderResolution:1});await wait(700);await cmd({type:'test-world-control',pan:0,scene:false,oldCoverage:false});await wait(400);
  for(const vertical of [0,250.5,667.8,1001.2,1699,2000]){
   for(let step=0;step<=20;step++){await cmd({type:'test-world-control',pan:Math.min(23000,step*1151.7),vertical,scene:false,oldCoverage:false,reuse:true,tiedTime:vertical===2000});await wait(60);}
   const stress=(await sample('tile-reuse-fixed-'+vertical,true)).renderProbe.fixture;assert.equal(stress.pan,23000);assert.equal(stress.vertical,vertical);assert.equal(stress.tiedTime,vertical===2000);assert.equal(stress.worldError,'');assert.equal(stress.pixelErrors,0,'Repeated LRU eviction with nonzero level origin and fractional/vertical camera travel must preserve all sampled pixels');assert.equal(stress.cacheRebuilds,0);
  }
  await cmd({type:'test-world-control',pan:250,scene:false,oldCoverage:true});await wait(600);
  const badCoverage=(await sample('world-old-coverage',true)).renderProbe.fixture;
  assert.equal(badCoverage.worldError,'');assert(badCoverage.pixelErrors>0,'Four original columns must reproduce uncovered pixels on the wider right edge');
  for(const resolution of [1,.75,.5]){
   await call('save-settings',{renderResolution:resolution});await wait(700);
   for(const pan of [0,127,250,287,575,888]){
    await cmd({type:'test-world-control',pan,scene:false,oldCoverage:false});await wait(450);
    const world=(await sample('world-'+resolution+'-pan-'+pan,pan===250)).renderProbe.fixture;
    assert.equal(world.pan,pan);assert.equal(world.worldError,'');assert(world.worldFrames>=3);assert.equal(world.pixelErrors,0,'Actual cache and Game renderer must cover all sampled world pixels');
    assert.equal(world.cacheRebuilds,0,'Stable dimensions must reuse the terrain cache');
   }
   for(const pan of [1000,1300,1500,1150,700,400,150,0,287,888]){
    await cmd({type:'test-world-control',pan,scene:false,oldCoverage:false,reuse:true});await wait(180);
    const moving=(await sample('moving-'+resolution+'-'+pan)).renderProbe.fixture;
    assert.equal(moving.worldError,'');assert.equal(moving.pixelErrors,0,'Continuous panning and actual tile eviction/reuse must preserve texture positions');assert.equal(moving.cacheRebuilds,0);
   }
  }
  await call('save-settings',{renderResolution:1});await wait(700);
  await cmd({type:'test-world-control',pan:0,vertical:0,scene:true,oldCoverage:false});await wait(1000);
  const home=(await sample('original-home-art-wide',true)).renderProbe.fixture;assert.equal(home.worldError,'');assert(home.worldFrames>=3);assert.equal(home.cacheRebuilds,0);
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
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
    assert.equal(wide.fixture.left,0);assert(Math.abs(wide.fixture.right-half*2)<.051);
   }
  }
  await call('save-settings',{gameZoom:1});await wait(800);
  await call('fullscreen');await wait(800);assert((await sample('wide-fullscreen',true)).renderProbe.widescreen.active);
  await call('exit-fullscreen');await wait(800);
  for(const art of ['a_Room_GreatHall','a_Room_Library','a_Room_Armory','a_Room_Stables']){
   await cmd({type:'test-world-control',pan:0,vertical:0,scene:true,oldCoverage:false,art});await wait(1000);
   const inside=(await sample('safe-interior-'+art,true)).renderProbe;
   assert.equal(inside.fixture.worldError,'');assert(inside.fixture.worldFrames>=3);
   assert.equal(inside.widescreen.requested,true);assert.equal(inside.widescreen.active,true);assert.equal(inside.widescreen.logicalWidth,p.widescreen.logicalWidth,'Home interiors must preserve the outer frame/HUD dimensions');
   assert.equal(inside.widescreen.interiorLimited,false,'No world clipping may conceal the player at either room edge');
   assert.equal(inside.presentation.canvas.width,inside.bitmapWidth);
   assert.equal(inside.fixture.roomInRootDomain,false,'Level art must live in a separate child asset domain, as in multiplayer');
   assert.equal(inside.fixture.worldError,'','Room rendering must not throw when its symbol is absent from the UI domain');
   if(['a_Room_GreatHall','a_Room_Library'].includes(art)){
    assert(inside.widescreen.roomWings?.visible,'Room backing must resolve its artwork from the owning level domain');
    const uncovered=await app.evaluate(({nativeImage},v)=>{
     const im=nativeImage.createFromPath(v.file),bytes=im.toBitmap(),width=im.getSize().width;
     const originX=(v.stageWidth-v.logicalWidth*v.scale)/2,originY=(v.stageHeight-768*v.scale)/2;
     return [200,335,600].map(row=>{let count=0;const y=Math.round(originY+row*v.scale);for(let x=Math.ceil(originX+8*v.scale);x<originX+(v.logicalWidth-8)*v.scale;x++){const n=(y*width+x)*4;if(bytes[n]===189&&bytes[n+1]===214&&bytes[n+2]===180)count++;}return count;});
    },{file:path.join(out,'safe-interior-'+art+'.png'),stageWidth:inside.stageWidth,stageHeight:inside.stageHeight,logicalWidth:inside.widescreen.logicalWidth,scale:inside.nativeScale});
    assert(uncovered.every(count=>count<3),'Passive room wings must cover transparent edge bands, not leave outdoor fixture color');
   }
  }
  await cmd({type:'test-world-control',pan:0,vertical:0,scene:true,oldCoverage:false,art:'a_Room_Main'});await wait(1000);
  assert((await sample('wide-resumes-outdoors',true)).renderProbe.widescreen.active);
  assert.equal((await sample('interior-clip-restored')).renderProbe.widescreen.interiorLimited,false);
  await cmd({type:'test-transition-control',play:true,transition:false});await wait(250);
  await call('settings');await checkbox.uncheck();await until(async()=>!(await call('state')).settings.experimentalWidescreen);await call('dismiss');await wait(1000);
  p=(await sample('restored-original',true)).renderProbe;assert.equal(p.widescreen.logicalWidth,1152);assert.equal(p.fixture.left,0);assert.equal(p.fixture.right,0);assert.equal(p.fixture.hotbar,0);assert.equal(p.fixture.chat,0);assert(Math.abs(p.fixture.idols.width-1154.9)<.061,'Restored matte geometry must agree within Flash twip quantization');assert.equal(p.fixture.edgeVisible,true);
  await call('save-settings',{experimentalWidescreen:true});await wait(1100);await cmd({type:'test-transition-control',play:false,transition:false});await wait(1000);
  assert.equal((await sample('return-to-menu',true)).renderProbe.widescreen.logicalWidth,1152+half*2,'Loading Login phases after play keep their viewport');
  // An unmodified live title screen validates revision compatibility/menu art.
  await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',gameZoom:1,renderResolution:1});await call('restart-game');
  await until(async()=>!(await call('state')).loading&&(await call('state')).clientIntegration);await wait(5000);
  const live=await sample('live-title-wide-enabled',true);assert(live.renderProbe);assert.equal(live.renderProbe.widescreen.requested,true);assert.equal(live.renderProbe.widescreen.active,false);assert.equal(live.renderProbe.animationRate,100);
  await call('save-settings',{experimentalWidescreen:false});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records,limits:'Inactive desktop/software rendering. Actual original class_23 terrain cache and Game.method_1946 with an owned striped scene and original Home/UI vector assets; test-only UI wiring skips network and player initialization. Live unauthenticated title only. Small disposable cache pool; tied timestamps belong to the owned fixture clock only. No authenticated combat, credentials, desktop switching or pointer confinement.'},null,2));
  console.log('PASS Prior transition allocator baseline reproduces fixed 2048x1152 mismatch; untouched reviewed upstream allocator matches native view at 1080p/1440p');
  console.log('PASS Experimental setting defaults off, validates booleans, retains 16:9 through all travel phases, preserves clocks and restores original HUD geometry on opt-out');
  console.log('PASS Widescreen input coordinates at left/center/right, no HUD drift, click-through frame, 50/75/100% raster and transitions; live title unaffected');
  console.log('PASS Baseline rebuilds terrain cache every frame; fixed renderer reuses it. Old column coverage reproduces right-edge gaps; six columns paint every sampled pixel across six camera offsets and three detail levels');
  console.log('PASS Original ornate border vector assets and offline Home art render through the actual terrain-cache/Game drawing path');
  console.log('PASS Long horizontal/fractional/vertical camera travel and repeated tile eviction preserve sampled pixels without cache rebuilds; tied-timestamp stress uses only the owned fixture clock');
  console.log('PASS Actual HUD/menu assets: left hotbar, right chat/top HUD, centered utility/quest/menu panels; world labels and party frames retain their origins; both original modal mattes cover the wide view and restore');
 }finally{if(app){await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
