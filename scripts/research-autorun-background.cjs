// Socket-blocked original key-manager/release integration, with a synthetic
// held-command sink. Standard headless Edge; no account, native game process,
// active desktop, OS input, global keyboard hook or installed artifact changes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const background=require('../research/gpu/background.cjs');background.lowerSelf();
const root=path.resolve(__dirname,'..'),out=path.join(root,'.test-tools/autorun-background'),original=path.join(root,'.test-tools/input-shortcuts/fixture.swf'),jar=path.join(root,'.test-tools/focus/ffdec/ffdec.jar'),lib=path.join(root,'.test-tools/focus/ffdec/lib/*');
const html=`<!doctype html><meta charset="utf-8"><script>window.RufflePlayer={config:{publicPath:'/engine/',polyfills:false,autoplay:'on',unmuteOverlay:'hidden',splashScreen:false,logLevel:'error',allowScriptAccess:true}};</script><script src="/engine/ruffle.js"></script><body><script>
const player=window.RufflePlayer.newest().createPlayer();document.body.appendChild(player);player.style.width='1152px';player.style.height='768px';player.ruffle().load({url:'/fixture.swf',allowScriptAccess:true});
const call=(name,...args)=>player.ruffle().callExternalInterface(name,...args),wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
window.checkBackgroundAutorun=async()=>{
 const assert=(yes,message)=>{if(!yes)throw Error(message);};
 for(let i=0;i<120;i++){const p=call('BlitzInputProbe');if(p?.error)throw Error(p.error);if(p?.phase==='ready')break;await new Promise(r=>setTimeout(r,100));}
 const checks=[];
 for(const [mode,command] of [['run-play','2'],['left','1']]){
  assert(call('BlitzInputFixtureControl',mode)===true,'Fixture mode failed');assert(call('BlitzAutorun')===true,'Activation failed');await wait();assert(call('BlitzInputProbe').held===command,'Native direction not held');
  assert(call('BlitzInputFixtureControl','run-deactivate')===true,'Deactivation failed');for(let i=0;i<30&&call('BlitzInputProbe').held!==command;i++)await wait();assert(call('BlitzInputProbe').held===command,'Focus loss interrupted active autorun: '+JSON.stringify(call('BlitzInputProbe')));
  assert(call('BlitzAutorun')===true,'Stop toggle failed');await wait();assert(call('BlitzInputProbe').held==='','Toggle did not release movement');checks.push(mode+' persists on stage deactivation and native key release');
 }
 call('BlitzInputFixtureControl','run-play');call('BlitzAutorun');await wait();call('BlitzStopAutorun');await wait();assert(call('BlitzInputProbe').held==='','Explicit stop did not release');
 for(const mode of ['run-open-map','run-type','run-leave','run-manual-stop']){
  assert(call('BlitzInputFixtureControl','run-play')===true,'Reset failed');assert(call('BlitzAutorun')===true,'Background activation failed');
  call('BlitzInputFixtureControl','run-deactivate');for(let i=0;i<30&&call('BlitzInputProbe').held!=='2';i++)await wait();assert(call('BlitzInputProbe').held==='2','Background direction absent');
  assert(call('BlitzInputFixtureControl',mode)===true,'Stop context failed');for(let i=0;i<30&&call('BlitzInputProbe').held!=='';i++)await wait();assert(call('BlitzInputProbe').held==='','Context did not stop background autorun: '+mode);
  for(let i=0;i<5;i++)await wait();assert(call('BlitzInputProbe').held==='','Movement restarted after '+mode);checks.push(mode+' stops active background movement');
 }
 return {passed:true,checks,scope:'Original key manager/release; synthetic held-command sink and stage deactivation',limits:['Not an OS Alt+Tab/minimize or authenticated movement test','Prepared helper remains unshipped'],noAccounts:true,noOSInput:true};
};</script>`;
(async()=>{
 if(!fs.existsSync(original))throw Error('Prepare the reviewed shortcut fixture first');fs.mkdirSync(out,{recursive:true});
 execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',original,path.join(out,'helper.swf'),'BlitzInput',path.join(root,'src/legacy/BlitzInput.as')],{windowsHide:true,stdio:'inherit',timeout:120000});
 execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-importScript',path.join(out,'helper.swf'),path.join(out,'fixture.swf'),path.join(root,'test/shortcut-fixture')],{windowsHide:true,stdio:'inherit',timeout:120000});
 execFileSync('javac',['-cp',lib,'-d',out,path.join(root,'research/gpu/VerifyFixture.java')],{windowsHide:true,stdio:'inherit',timeout:60000});
 execFileSync('java',['-Djava.awt.headless=true','-cp',out+path.delimiter+lib,'VerifyFixture',original,path.join(out,'fixture.swf'),'BlitzInput'],{windowsHide:true,stdio:'inherit',timeout:60000});
 const engine=path.join(root,'.test-tools/gpu-native/engine'),files=new Map([['/fixture.swf',path.join(out,'fixture.swf')],['/assets/UI_0.swf',path.join(root,'.test-tools/wide-live-assets/UI_0.swf')]]);for(const name of fs.readdirSync(engine))if(/^[a-zA-Z0-9_.-]+\.(js|wasm)$/.test(name))files.set('/engine/'+name,path.join(engine,name));
 const server=http.createServer((req,res)=>{if(req.method!=='GET'){res.writeHead(405);return res.end();}if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=files.get(req.url);if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/x-shockwave-flash');fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=d3d11','--renderer-process-limit=1']});const context=await browser.newContext({viewport:{width:1152,height:768},serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(origin+'/');background.lowerOwnedChildren();await page.waitForFunction(()=>typeof window.checkBackgroundAutorun==='function');const result=await Promise.race([page.evaluate(()=>window.checkBackgroundAutorun()),new Promise((_,reject)=>setTimeout(()=>reject(Error('Background autorun probe timed out')),30000).unref())]);result.checkedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
