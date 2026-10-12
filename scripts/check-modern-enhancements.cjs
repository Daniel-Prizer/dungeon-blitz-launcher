'use strict';
// Research only: owned offline fixtures in an isolated headless browser. No
// saved profile, sockets, game login, OS input or production runtime replacement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/modern-web-check'),origin='https://dungeonblitz.theminesa.studio';
const fixture=path.join(root,'.test-tools/transition/fixed.swf'),apiFixture=path.join(root,'.test-tools/modern-api.swf');
const assets=['UI_0.swf','UI_0_1.swf','UI_0_2.swf','UI_0_3.swf','UI_1.swf','UI_2.swf','UI_4.swf','UI_Library.swf','UI_Seasonal.swf','LevelsHome.swf','LevelsJC.swf','LevelsBT.swf','GlobalMap01.swf'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const html='<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;background:#484955}ruffle-player{display:block;width:100%;height:100%}</style></head><body><script>window.RufflePlayer={config:{publicPath:"/ruffle/",polyfills:false,autoplay:"on",unmuteOverlay:"hidden",splashScreen:false,letterbox:"off",logLevel:"warn",allowScriptAccess:true}};</script><script src="/ruffle/ruffle.js"></script><script>const player=window.RufflePlayer.newest().createPlayer();document.body.appendChild(player);window.probePlayer=player;player.ruffle().load({url:"/DungeonBlitz-fixture.swf",allowScriptAccess:true});</script></body></html>';
(async()=>{
 if(!fs.existsSync(fixture))throw Error('Run npm run test:camera to prepare the original-asset fixture first.');
 fs.mkdirSync(out,{recursive:true});
 execFileSync('java',['-Djava.awt.headless=true','-jar',path.join(root,'.test-tools/focus/ffdec/ffdec.jar'),'-importScript',fixture,apiFixture,path.join(root,'test/modern-api-fixture')],{windowsHide:true,stdio:'inherit'});
 const engineResponse=await fetch(origin+'/ruffle/ruffle.js',{signal:AbortSignal.timeout(20000)});if(!engineResponse.ok)throw Error('Official Ruffle HTTP '+engineResponse.status);
 const engineBytes=Buffer.from(await engineResponse.arrayBuffer()),engineText=engineBytes.toString('utf8');
 const build=engineText.match(/versionNumber:"([^"]+)",versionName:"([^"]+)",versionChannel:"([^"]+)",buildDate:"([^"]+)",commitHash:"([^"]+)"/);
 let executable=chromium.executablePath();if(!fs.existsSync(executable))executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f=>fs.existsSync(f));
 if(!executable)throw Error('Install a Playwright Chromium browser before this check.');
 const browser=await chromium.launch({headless:true,executablePath:executable});
 const warnings=[],records=[];let mode='api',api;
 try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  await context.routeWebSocket('**/*',ws=>ws.close());
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(!['GET','HEAD'].includes(request.method())||url.origin!==origin)return route.abort();
   if(url.pathname==='/__launcher_fixture')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/DungeonBlitz-fixture.swf')return route.fulfill({contentType:'application/x-shockwave-flash',body:fs.readFileSync(mode==='api'?apiFixture:fixture)});
   if(url.pathname==='/ruffle/ruffle.js')return route.fulfill({contentType:'text/javascript',body:engineBytes});
   if(url.pathname.startsWith('/ruffle/'))return route.continue();
   if(assets.some(asset=>url.pathname==='/assets/'+asset))return route.fulfill({contentType:'application/x-shockwave-flash',body:fs.readFileSync(path.join(root,'.test-tools/wide-live-assets',path.basename(url.pathname)))});
   return route.abort();
  });
  const page=await context.newPage();
  page.on('console',m=>{if(['warning','error'].includes(m.type())&&warnings.length<60)warnings.push(m.text().slice(0,600));});
  page.on('pageerror',e=>{if(warnings.length<60)warnings.push(e.message.slice(0,600));});
  const call=(name,...args)=>page.evaluate(({name,args})=>window.probePlayer.ruffle().callExternalInterface(name,...args),{name,args});
  async function ready(name){for(let i=0;i<80;i++){await page.waitForTimeout(500);const value=await call(name);if(value)return value;}throw Error('Ruffle fixture did not initialize: '+name);}
  async function sample(name){const value=await call('BlitzRenderState'),f=value.fixture;
   records.push({name,stageWidth:value.stageWidth,stageHeight:value.stageHeight,bitmapWidth:value.bitmapWidth,bitmapHeight:value.bitmapHeight,widescreen:value.widescreen,fixture:{hotbar:f.hotbar,chat:f.chat,quest:f.quest,worldFrames:f.worldFrames,worldError:f.worldError,pixelErrors:f.pixelErrors,cacheRebuilds:f.cacheRebuilds,camera:f.camera,map:f.map,labels:f.labels.map(l=>({error:l.error,errorX:l.errorX,errorY:l.errorY}))}});
   return value;
  }
  await page.goto(origin+'/__launcher_fixture');api=await ready('BlitzApiProbe');
  assert.equal(api.readError,'');assert(api.graphicsDataItems>0,'Served engine must return real graphics data');assert.equal(api.drawError,'');assert.equal(api.pixel,0xffff9933,'drawWithQuality must retain the drawn pixel');
  mode='hud';await page.reload();const initial=await ready('BlitzRenderState');assert(initial.fixture);
  await call('BlitzSetWidescreen',true);await call('BlitzTransitionFixtureControl',true,false);await page.waitForTimeout(1200);
  const wide=await sample('wide');assert(wide.widescreen.active);assert(wide.widescreen.hudRaster.width>0);assert(wide.fixture.labels.every(l=>!l.error&&l.errorX===0&&l.errorY===0));
  await page.screenshot({path:path.join(out,'ruffle-hud-fixture.png')});
  await call('BlitzSetCenteredHotbar',true);await page.waitForTimeout(500);const centered=await sample('centered'),half=(centered.widescreen.logicalWidth-1152)/2;
  for(const field of ['hotbar','chat','quest'])assert(Math.abs(centered.fixture[field]-half)<.1);
  await page.screenshot({path:path.join(out,'ruffle-centered-fixture.png')});
  await call('BlitzSetCenteredHotbar',false);await call('BlitzTransitionFixtureControl',true,true,'tome');await page.waitForTimeout(500);
  assert((await sample('inspection')).widescreen.hudRaster.inspection);await page.screenshot({path:path.join(out,'ruffle-inspection-fixture.png')});
  await call('BlitzTransitionFixtureControl',true,true,'none');await call('BlitzWorldFixtureControl',250,true,false,false,250,false,'a_Room_Main');await page.waitForTimeout(1000);
  const world=await sample('world');assert.equal(world.fixture.worldError,'');assert(world.fixture.worldFrames>0);await page.screenshot({path:path.join(out,'ruffle-world-fixture.png')});
  for(const wideMode of [false,true]){
   await call('BlitzSetWidescreen',wideMode);await call('BlitzTransitionFixtureControl',true,false);await page.waitForTimeout(100);
   const native=[];
   await call('BlitzSetCenteredCamera',false);
   for(let kind=0;kind<8;kind++){
    await call('BlitzWorldFixtureControl',kind,false,false,false,250,false,'a_Room_FollowProbe');
    native.push((await call('BlitzRenderState')).fixture.camera);assert(!native[kind].error,native[kind].error);
   }
   await call('BlitzSetCenteredCamera',true);
   for(let kind=0;kind<8;kind++){
    await call('BlitzWorldFixtureControl',kind,false,false,false,250,false,'a_Room_FollowProbe');
    const state=await call('BlitzRenderState'),probe=state.fixture.camera;assert(state.centeredCamera);assert(!probe.error,probe.error);
    for(const [i,point]of probe.follow.entries()){
     assert(Number.isFinite(point.target)&&Number.isFinite(point.render));
     assert.equal(point.y,native[kind].follow[i].y);assert.equal(point.layerY,native[kind].follow[i].layerY);
     if(probe.roomWidth){assert(point.target>=-.001);assert(point.target<=probe.roomWidth-probe.width+.001);}
     if([0,1,5,6,7].includes(kind))assert(Math.abs(point.player-point.target-probe.width/2)<=probe.width*.061);
    }
    if(kind===3||kind===4)assert.deepEqual(probe,native[kind]);
   }
   await call('BlitzSetCenteredCamera',false);
  }
  const result={checkedAt:new Date().toISOString(),url:origin,engineHash:hash(engineBytes),build:build?{version:build[1],name:build[2],channel:build[3],date:build[4],commit:build[5]}:null,fixtureHash:hash(fs.readFileSync(fixture)),browser:await browser.version(),api,records,cameraChecks:{layouts:2,cases:32,samples:28800},warnings,limits:'Offline original-asset/native-controller fixture only. All sockets blocked; no account, multiplayer, persistence, combat performance or audible sound verification. No production migration.'};
  fs.writeFileSync(path.join(out,'enhancements.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({build:result.build,api,checks:records.map(r=>r.name),centeredCamera:'PASS original/wide: central band, bounds, vertical targets, pointer-direction flips, teleports, frozen/scripted cameras',warnings,limits:result.limits},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
