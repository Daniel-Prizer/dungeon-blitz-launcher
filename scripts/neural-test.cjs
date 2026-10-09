'use strict';
const {_electron:electron}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/neural-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 require('node:child_process').execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(name,value)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[name,value]);
  await call('save-settings',{upscaler:'off',neuralCompare:false,cursorLock:false,gameZoom:1});
  assert.equal(await page.locator('#presentation-fps').count(),0,'Misleading FPS selector must be removed');
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].showInactive();BrowserWindow.getAllWindows()[0].focus();});
  await wait(15000);
  const cmd=command=>app.evaluate(({},command)=>global.__blitzTest.nativeCommand(null,command),command);
  const measure=async name=>{const file=path.join(out,name);if(fs.existsSync(file+'.png.json'))fs.unlinkSync(file+'.png.json');await cmd({type:'capture',path:file+'.png'});for(let i=0;i<100&&!fs.existsSync(file+'.png.json');i++)await wait(100);if(!fs.existsSync(file+'.png.json'))throw Error('The guarded game renderer did not respond to the capture probe. '+(process.env.BLITZ_NEURAL_GPU_TEST==='1'?'Hardware-accelerated capture on the inactive desktop is not established.':'Capture validation failed.'));return JSON.parse(fs.readFileSync(file+'.png.json','utf8'));};
  const before=await measure('native');assert(before.clientIntegration);assert(before.focused&&before.contentFocused);
  await page.locator('#settings').click();await page.locator('#upscaler').selectOption('neural');await page.locator('#done').click();await wait(5000);const warm=await measure('warm');console.log('NEURAL WARM',warm.neural);
  assert(warm.neural.native?.initialized,'Real D3D neural network must compile and start');assert(warm.neural.native.frames>0,'Real frames must reach neural network');
  await cmd({type:'test-neural-readback',path:path.join(out,'warm.rgba')});await wait(1000);assert(fs.existsSync(path.join(out,'warm.rgba')));
  fs.writeFileSync(path.join(out,'neural-output.png'),require('./png.cjs')(warm.neural.native.inputWidth*2,warm.neural.native.inputHeight*2,fs.readFileSync(path.join(out,'warm.rgba'))));
  const pairs=[];
  async function comparison(name,split){
   const file=path.join(out,name);if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');await cmd({type:'test-neural-comparison',path:file});for(let i=0;i<100&&!fs.existsSync(file+'.json');i++)await wait(100);
   const meta=JSON.parse(fs.readFileSync(file+'.json')),source=fs.readFileSync(file+'.source.rgba'),final=fs.readFileSync(file+'.presented.rgba');assert.equal(final.length,meta.width*meta.height*4);assert.equal(source.length,final.length);assert(meta.native.aboveGame,'Neural surface must actually be above the game');assert.equal(meta.native.displayWidth,meta.width);assert.equal(meta.native.displayHeight,meta.height);
   const original=require('./decode-png.cjs')(fs.readFileSync(file+'.original.png'));assert.equal(original.width,meta.width);assert.equal(original.height,meta.height);
   for(let i=0;i<meta.width*meta.height;i++)for(let channel=0;channel<3;channel++)assert.equal(source[i*4+channel],original.pixels[i*original.channels+channel],'GPU-normalized source must exactly match the real Chromium PNG colors');
   let delta=0,changed=0,leftDelta=0,rightDelta=0;for(let i=0;i<final.length;i+=4){const diff=Math.abs(final[i]-source[i])+Math.abs(final[i+1]-source[i+1])+Math.abs(final[i+2]-source[i+2]);delta+=diff;if(diff>6)changed++;const x=(i/4)%meta.width;if(x<meta.width/2-2)leftDelta+=diff;if(x>meta.width/2+2)rightDelta+=diff;}
   const record={name,meta,meanRGBDelta:delta/(meta.width*meta.height*3),fractionChanged:changed/(meta.width*meta.height),leftDelta,rightDelta};assert(record.fractionChanged>.01,'Final window-sized image must differ from exact source pixels');
   if(split){assert.equal(leftDelta,0,'Comparison original half must be byte-identical to its source');assert(rightDelta>0,'Neural half must be processed');}
   fs.writeFileSync(file+'.source.png',require('./png.cjs')(meta.width,meta.height,source));fs.writeFileSync(file+'.presented.png',require('./png.cjs')(meta.width,meta.height,final));pairs.push(record);console.log('DISPLAY COMPARISON',record);
  }
  await comparison('quality-final',false);
  const subscription=path.join(out,'subscription');if(fs.existsSync(subscription+'.json'))fs.unlinkSync(subscription+'.json');await cmd({type:'test-neural-subscription',path:subscription});for(let i=0;i<60&&!fs.existsSync(subscription+'.json');i++)await wait(100);assert(fs.existsSync(subscription+'.json'),'A real RGBA frame subscription must be checked');
  const sub=JSON.parse(fs.readFileSync(subscription+'.json')),subRaw=fs.readFileSync(subscription+'.source.rgba'),subPng=require('./decode-png.cjs')(fs.readFileSync(subscription+'.original.png'));assert.equal(subRaw.length,sub.width*sub.height*4);for(let i=0;i<sub.width*sub.height;i++)for(let c=0;c<3;c++)assert.equal(subRaw[i*4+c],subPng.pixels[i*subPng.channels+c],'Real subscription RGBA colors must match the actual PNG');
  console.log('PASS Both real BGRA capturePage and RGBA subscription match original PNG colors');
  const samples=[];for(let i=0;i<6;i++){await wait(1000);samples.push((await measure('sample-'+i)).neural);}
  assert(samples.at(-1).frames>samples[0].frames+20,'Continuous rendering must keep advancing');
  const fixture=path.join(out,'colors.rgba');if(fs.existsSync(fixture))fs.unlinkSync(fixture);await cmd({type:'test-neural-fixture',path:fixture});for(let i=0;i<50&&!fs.existsSync(fixture);i++)await wait(100);const rgb=fs.readFileSync(fixture);
  const red=(64*128+32)*4,blue=(64*128+96)*4;assert(rgb[red]>180&&rgb[red+2]<70,'Red fixture must remain red');assert(rgb[blue+2]>180&&rgb[blue]<70,'Blue fixture must remain blue');
  await wait(800);
  const geometry=[];
  async function placement(name){await app.evaluate(()=>{const g=global.__blitzTest.runtime();g.windowTest=null;g.testHost('TESTWINDOW');});let record;for(let i=0;i<100&&!record;i++){await wait(100);record=await app.evaluate(()=>global.__blitzTest.runtime().windowTest);}assert(record);assert.deepEqual(record.actual,record.expected);const state=await measure(name);assert.deepEqual(state.neural.native.rect,{x:record.actual.left,y:record.actual.top,width:record.actual.right-record.actual.left,height:record.actual.bottom-record.actual.top});assert.equal(state.neural.native.hit,-1);assert(state.neural.native.sameThread&&state.focused&&state.contentFocused);geometry.push({name,record,state});}
  await placement('initial');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1400,900);const b=w.getBounds();w.setPosition(b.x+30,b.y+20);});await wait(1200);await placement('resize-move');
  await page.locator('#fullscreen').click();await wait(1000);await placement('fullscreen');await call('exit-fullscreen');await wait(1000);await placement('fullscreen-exit');
  await page.locator('#settings').click();await wait(400);assert.equal((await measure('settings')).neural.native.visible,false);await page.locator('#neural-compare').check();await page.locator('#done').click();await wait(1000);await comparison('quality-split',true);
  await page.locator('#settings').click();await page.locator('#upscaler').selectOption('off');await page.locator('#done').click();await wait(300);const off=await measure('off');assert.equal(off.neural.mode,'off');assert(off.focused&&off.contentFocused);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({before,warm,pairs,samples,geometry,off},null,2));console.log('PASS Neural final display changes pixels, original comparison half is exact, RGB, validation, native placement, settings/fullscreen and fallback');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
