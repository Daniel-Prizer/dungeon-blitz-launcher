// Native bitmap/graphics observer integration. Disposable standard Edge,
// public assets only, no profile, credentials, authentication request, game
// socket, launcher process, OS input or desktop capture.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.test-tools/gpu-live');
const background=require('../research/gpu/background.cjs');background.lowerSelf();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const bridge=fs.readFileSync(require('./prepare-gpu-live-bridge.cjs')({mutations:true})),evidence=JSON.parse(fs.readFileSync(path.join(out,'provenance-mutations.json'),'utf8'));
 if(hash(bridge)!==evidence.outputHash)throw Error('Research bridge integrity mismatch');
 const allowed=new Set(['https://dungeonblitz.theminesa.studio','https://dungeonblitzr.theminesa.studio']);let browser,context,sourceChecked=false,socketsBlocked=0;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=d3d11']});context=await browser.newContext({viewport:{width:1200,height:800},serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());if(!allowed.has(u.origin)||request.method()!=='GET'||u.pathname.startsWith('/api/'))return route.abort();
   if(u.pathname.endsWith('/DungeonBlitz.swf')){const response=await route.fetch(),original=await response.body();if(hash(original)!==evidence.sourceHash)throw Error('Fresh public source changed; research observer refused');sourceChecked=true;return route.fulfill({response,body:bridge,headers:{...response.headers(),'content-length':String(bridge.length),'cache-control':'no-store'}});}return route.continue();
  });
  await context.routeWebSocket('**/*',ws=>{socketsBlocked++;ws.close();});
  const page=await context.newPage(),errors=[];page.on('console',m=>{if(m.type()==='error'&&errors.length<10)errors.push(m.text().slice(0,1000));});page.on('pageerror',e=>errors.push(e.message.slice(0,1000)));page.setDefaultTimeout(45000);await page.goto('https://dungeonblitz.theminesa.studio/web',{waitUntil:'load'});background.lowerOwnedChildren();
  await page.waitForFunction(()=>{try{return document.querySelector('ruffle-player')?.ruffle().callExternalInterface('BlitzGpuStructure')?.ready===true;}catch{return false;}});
  const probe=await page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('BlitzGpuObserverProbe'));
  assert(sourceChecked);assert.equal(probe.copied,0xffff0000);assert.equal(probe.green,0xff00ff00);assert.equal(probe.blue,0xff0000ff);assert.equal(probe.changed,4);
  for(const key of ['nativeErrorCaught','sourceObserved','copyObserved','thresholdObserved','graphicsObserved','drawObserved','errorObserved','disposeObserved'])assert.equal(probe[key],true,key);
  const state=await page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('BlitzGpuStructure'));assert.equal(state.mutationFault,false);assert.equal(state.writeCoverage,true);
  const guardedFrame=await page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('BlitzGpuFrame',[],false));assert(guardedFrame&&guardedFrame.protocol===1&&guardedFrame.supported===false,'Frame guard unavailable: '+JSON.stringify({guardedFrame,errors}));
  const afterDraw=await page.evaluate(async()=>{const p=document.querySelector('ruffle-player').ruffle(),request=p.callExternalInterface('BlitzGpuRequestFrame',[],false);for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,10));const result=p.callExternalInterface('BlitzGpuFrameResult');if(result?.request===request)return {result,state:p.callExternalInterface('BlitzGpuStructure')};}throw Error('Precise native draw guard timed out');});assert.equal(afterDraw.state.afterDrawFault,'');assert.equal(afterDraw.result.supported,false);assert.equal(afterDraw.result.samplingPhase,'after-native-world-draw');
  const binaryProbe=await page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('BlitzGpuBinaryProbe'));const {verifyBinaryProbe}=await import('../src/gpu/binary.mjs');assert(verifyBinaryProbe(binaryProbe),'Modern engine byte-string transport is lossy: '+JSON.stringify({encoding:binaryProbe?.encoding,expected:binaryProbe?.bytes,length:binaryProbe?.data?.length,codes:binaryProbe?.data?[...binaryProbe.data].map(c=>c.charCodeAt(0)).slice(120,170):null}));
  const result={status:'pass',checkedAt:new Date().toISOString(),sourceHash:evidence.sourceHash,bridgeHash:evidence.outputHash,originalMethods:evidence.verification.originalMethods,observerMethods:evidence.verification.mutationObserverMethods,observerSites:363,probe,guardedFrame,afterDraw:{result:afterDraw.result,calls:afterDraw.state.afterDrawCalls,fault:afterDraw.state.afterDrawFault},socketsBlocked,browser:await browser.version(),scope:'Owned tiny native BitmapData/Graphics API probe in socket-blocked official Ruffle; no account or accelerated live game claim'};
  fs.writeFileSync(path.join(out,'observer-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(context)await context.unrouteAll({behavior:'ignoreErrors'});if(browser)await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
