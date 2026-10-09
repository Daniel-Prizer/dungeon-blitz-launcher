'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/fps-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await wait(100);}throw Error('FPS check timed out');}
(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const server=http.createServer((req,res)=>{
  if(req.url==='/DungeonBlitz.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/audio/fps-fixture.swf')));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}object{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/DungeonBlitz.swf"><param name="movie" value="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let app;const records=[];
 try{
  app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(name,value)=>page.evaluate(([name,value])=>window.blitz.action(name,value),[name,value]);
  const cmd=value=>app.evaluate(({},value)=>global.__blitzTest.nativeCommand(null,value),value);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1920,1112);w.showInactive();w.focus();});
  await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',gameZoom:1,cursorLock:false,renderResolution:1});await call('restart-game');
  await until(async()=>!(await call('state')).loading&&(await call('state')).clientIntegration);await wait(4000);
  async function sample(name,image=false){
   const file=path.join(out,name+'.png');if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');if(image&&fs.existsSync(file))fs.unlinkSync(file);
   await cmd({type:image?'capture':'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json')&&(!image||fs.existsSync(file)));
   const record=JSON.parse(fs.readFileSync(file+'.json'));records.push({name,...record});return record;
  }
  function measured(record){
   const counter=record.renderProbe?.frameCounter;assert(counter,'The actual Flash counter must be attached');
   assert.equal(counter.source,'game-enter-frame');assert.equal(counter.mouseEnabled,false);assert.equal(counter.selectable,false);
   assert(counter.sampleMs>=1000&&counter.sampleFrames>0&&counter.fps>0);
   assert(Math.abs(counter.fps-counter.sampleFrames*1000/counter.sampleMs)<.0001,'FPS must be counted frames over actual elapsed time');
   assert.equal(counter.rangeSeconds,30);assert(counter.rangeSamples>=1&&counter.rangeSamples<=31);
   assert(counter.lowFPS>0&&counter.lowFPS<=counter.fps&&counter.highFPS>=counter.fps);
   assert.equal(counter.text.replace(/\r\n?/g,'\n'),Math.round(counter.fps)+' FPS\nLow '+Math.round(counter.lowFPS)+'\nHigh '+Math.round(counter.highFPS));return counter;
  }
  const live=await sample('live-1080p',true),counter=measured(live);assert(counter.visible);
  assert(counter.x+counter.width<=(live.renderProbe.stageWidth-(1152+62)*live.renderProbe.nativeScale)/2,'Counter must fit outside the original game frame');
  assert.equal(live.renderProbe.animationRate,100,'Production target must remain unchanged');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(2560,1472));await wait(1800);assert(measured(await sample('live-1440p',true)).visible);
  await call('save-settings',{gameZoom:1.5});await wait(1000);assert.equal((await sample('live-cropped')).renderProbe.frameCounter.visible,false,'No counter may cover a cropped game');
  await call('save-settings',{gameZoom:1});await call('fullscreen');await wait(1800);assert(measured(await sample('live-fullscreen',true)).visible);
  await call('exit-fullscreen');await call('settings');await call('dismiss');await wait(700);const restored=await sample('live-restored');assert(restored.focused&&restored.contentFocused);assert(measured(restored).visible);
  await call('save-settings',{gameURL:'http://127.0.0.1:'+server.address().port+'/'});await call('restart-game');await until(async()=>!(await call('state')).loading);await wait(2000);
  async function control(rate,busy,margins=true){
   await cmd({type:'test-fps-control',rate,busy,margins});await wait(2400);
   const record=await sample('fixture-'+rate+'-'+busy+'-'+margins),c=measured(record),f=record.renderProbe.fixture;
   assert.equal(record.renderProbe.animationRate,rate);assert.equal(c.totalFrames,f.totalFrames,'Independent observer must count the same actual frames');
   assert(Math.abs(c.fps-f.observedFPS)<2,'Counter must match independent frame observer');return record;
  }
  for(const rate of [30,60,100])await control(rate,0);
  const loaded=await control(100,80);assert(loaded.renderProbe.frameCounter.fps<20,'Stalled fixture must show measured low FPS while target stays 100');
  const slow=loaded.renderProbe.frameCounter;assert(slow.lowFPS<20&&slow.highFPS>slow.fps*1.5,'Recent range must retain both slow and fast measured averages');
  const recovered=await control(60,0);assert(recovered.renderProbe.frameCounter.lowFPS<20,'Recent low remains visible immediately after recovery');
  await sample('recovered-with-range',true);
  const before=await sample('before-click'),c=measured(before);assert(c.visible);
  for(const row of [12,32,52])for(const type of ['mouseDown','mouseUp'])await cmd({type:'test-input',input:{type,x:Math.round((c.x+25)*before.scale),y:Math.round((c.y+row)*before.scale),button:'left',clickCount:1}});
  await wait(150);const clicked=await sample('clicked-counter');assert.equal(clicked.renderProbe.fixture.mouseDowns,3);assert.equal(clicked.renderProbe.fixture.mouseUps,3);assert.notEqual(clicked.renderProbe.fixture.lastTarget,'blitz-fps-counter','All counter rows must pass gameplay clicks through');
  assert.equal((await control(60,0,false)).renderProbe.frameCounter.visible,false);
  await control(60,0,true);await sample('fixture-visible',true);
  await wait(31000);const expired=measured(await sample('range-expired',true));
  assert(expired.lowFPS>20,'The forced-stall low must expire from the 30-second range');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,records},null,2));
  console.log('PASS Real Flash measured FPS in gray margin at 1080p/1440p/fullscreen; cropped views hide counter; focus preserved');
  console.log('PASS Independent 30/60/100 frame observer and forced stall prove measured cadence, not target FPS; counter clicks pass through');
  console.log('PASS Recent 30-second low/high range retains stalls, expires old values, bounds history and passes clicks through all three rows');
 }finally{if(app){await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
