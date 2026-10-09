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
  await call('save-settings',{upscaler:'off',presentationFPS:60,cursorLock:false,gameZoom:1});
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].showInactive();BrowserWindow.getAllWindows()[0].focus();});
  await wait(15000);
  const cmd=command=>app.evaluate(({},command)=>global.__blitzTest.nativeCommand(null,command),command);
  const measure=async name=>{const file=path.join(out,name);if(fs.existsSync(file+'.png.json'))fs.unlinkSync(file+'.png.json');await cmd({type:'capture',path:file+'.png'});for(let i=0;i<100&&!fs.existsSync(file+'.png.json');i++)await wait(100);return JSON.parse(fs.readFileSync(file+'.png.json','utf8'));};
  const before=await measure('native');assert(before.clientIntegration);assert(before.focused&&before.contentFocused);
  await page.locator('#settings').click();await page.locator('#upscaler').selectOption('neural');await page.locator('#done').click();await wait(5000);const warm=await measure('warm');console.log('NEURAL WARM',warm.neural);
  assert(warm.neural.native?.initialized,'Real D3D neural network must compile and start');assert(warm.neural.native.frames>0,'Real frames must reach neural network');
  await cmd({type:'test-neural-readback',path:path.join(out,'warm.rgba')});await wait(1000);assert(fs.existsSync(path.join(out,'warm.rgba')));
  fs.writeFileSync(path.join(out,'neural-output.png'),require('./png.cjs')(warm.neural.native.inputWidth*2,warm.neural.native.inputHeight*2,fs.readFileSync(path.join(out,'warm.rgba'))));
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
  await page.locator('#settings').click();await wait(400);assert.equal((await measure('settings')).neural.native.visible,false);await page.locator('#presentation-fps').selectOption('120');await page.locator('#done').click();await wait(2000);const limit120=await measure('limit120');assert.equal(limit120.neural.targetFPS,120);assert(limit120.focused&&limit120.contentFocused);
  await page.locator('#settings').click();await page.locator('#upscaler').selectOption('off');await page.locator('#done').click();await wait(300);const off=await measure('off');assert.equal(off.neural.mode,'off');assert(off.focused&&off.contentFocused);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({before,warm,samples,geometry,limit120,off},null,2));console.log('PASS Neural sustained rendering, RGB, validation, click-through, native placement, settings/fullscreen and original fallback');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
