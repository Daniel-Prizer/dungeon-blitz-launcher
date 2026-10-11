'use strict';
// Read-only, unauthenticated probe. Uses an isolated headless browser and never
// visits the user's browser profile, submits login fields or contacts a local bridge.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {LIVE}=require('../src/policy.cjs');
const output=path.resolve(__dirname,'../docs/modern-web-check');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const response=await fetch(LIVE,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Game page HTTP '+response.status);
 const html=await response.text();
 const discovered=[...html.matchAll(/[^\s"'<>]*\.swf[^\s"'<>]*/g)].map(match=>match[0]);
 const raw=discovered.find(value=>/DungeonBlitz/i.test(value));
 const swfURL=raw?new URL(raw.replace(/^`/,'').replace(/\$\{languageParam\}`;$/,''),LIVE):null;
 let swfHash=null;if(swfURL){const swf=await fetch(swfURL,{signal:AbortSignal.timeout(20000)});if(!swf.ok)throw Error('Game SWF HTTP '+swf.status);swfHash=crypto.createHash('sha256').update(Buffer.from(await swf.arrayBuffer())).digest('hex');}
 let executable=chromium.executablePath();
 if(!fs.existsSync(executable))executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
 if(!executable)throw Error('Install a Playwright Chromium browser before this check');
 const browser=await chromium.launch({headless:true,executablePath:executable});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());return !['GET','HEAD'].includes(request.method())||['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/^\/api\/(?:auth\/discord|presence)(?:\/|$)/.test(url.pathname)?route.abort():route.continue();});
  const page=await context.newPage();await page.goto(LIVE,{waitUntil:'load',timeout:30000});await page.waitForTimeout(3000);
  const rendered=await page.evaluate(()=>{const fallback=[...document.querySelectorAll('#fallback h2,#DungeonBlitz h2')].find(element=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden');return {fallbackVisible:!!fallback,fallbackText:fallback?.textContent?.trim()||'',flashMimeAvailable:!!navigator.mimeTypes['application/x-shockwave-flash'],flashObjects:document.querySelectorAll('object[type="application/x-shockwave-flash"],embed[type="application/x-shockwave-flash"]').length,rufflePlayers:document.querySelectorAll('ruffle-player,ruffle-object,ruffle-embed').length,canvases:document.querySelectorAll('canvas').length};});
  await page.screenshot({path:path.join(output,'official-site.png')});
  const result={checkedAt:new Date().toISOString(),url:LIVE,browser:await browser.version(),swfURL:swfURL?.href||null,swfHash,pageIncludesModernEngine:/ruffle|\.wasm|socketProxy/i.test(html),rendered,conclusion:rendered.fallbackVisible&&rendered.fallbackText==='Adobe Flash Player Required'?'Current official page cannot run in this modern browser.':'A changed page needs rendering and authenticated multiplayer verification; this probe cannot establish playable support.'};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
