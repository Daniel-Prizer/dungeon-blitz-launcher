'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/local-icon-test'),out=path.join(root,'docs/local-icon-tests'),assets=path.join(root,'.test-tools/hotbar-diagnosis/assets');
execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
process.env.BLITZ_NATIVE_TEST='1';fs.mkdirSync(out,{recursive:true});
// Each run owns a fresh host/profile. No player or agent cache is copied.
const host=fs.mkdtempSync(path.join(dir,'host-'));
for(const name of ['src','assets','runtime'])fs.cpSync(path.join(root,name),path.join(host,name),{recursive:true});
fs.copyFileSync(path.join(root,'package.json'),path.join(host,'package.json'));
fs.mkdirSync(path.join(host,'.test-tools'),{recursive:true});fs.copyFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),path.join(host,'.test-tools/PrivateDesktop.exe'));
fs.mkdirSync(path.join(host,'.test-profile'),{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<160;i++){const value=await fn();if(value)return value;await wait(100);}throw Error('Offline icon check timed out');}
module.exports=(async()=>{
 let mode='negative';const requests=[],records=[];
 const server=http.createServer((req,res)=>{
  requests.push({mode,path:req.url,conditional:!!req.headers['if-none-match']||!!req.headers['if-modified-since']});
  if(req.url.startsWith('/assets/')){const file=path.join(assets,path.basename(req.url));if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}let bytes=fs.readFileSync(file);
   // A legal SWF version change gives an unreviewed hash, preserving all
   // original native symbols, code and artwork for this negative control.
   if(mode==='negative'&&path.basename(req.url)==='UI_1.swf'){bytes=Buffer.from(bytes);bytes[3]=16;}
   if(path.basename(req.url)==='UI_1.swf'){res.setHeader('ETag','"native-ui"');res.setHeader('Cache-Control','public, max-age=0');res.setHeader('Last-Modified','Tue, 13 Oct 2026 00:00:00 GMT');if(req.headers['if-none-match']||req.headers['if-modified-since']){res.writeHead(304);res.end();return;}}
   res.setHeader('Content-Type','application/x-shockwave-flash');res.end(bytes);return;
  }
  if(req.url==='/DungeonBlitz.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(dir,'fixture.swf')));return;}
  if(req.url!=='/'){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}object{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" data="/DungeonBlitz.swf" type="application/x-shockwave-flash"><param name="movie" value="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 fs.writeFileSync(path.join(host,'.test-profile/preferences.json'),JSON.stringify({settings:require('../src/policy.cjs').validSettings({gameURL:'http://localhost:'+server.address().port+'/',autoUpdates:false,experimentalWidescreen:false,showFPS:false,cursorLock:false})}));
 const env={...process.env,APPDATA:path.join(host,'test-roaming'),LOCALAPPDATA:path.join(host,'test-local')};delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(env.APPDATA,{recursive:true});fs.mkdirSync(env.LOCALAPPDATA,{recursive:true});
 let app;
 try{
  app=await electron.launch({args:[host,'--smoke-test','--private-desktop'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(name,value)=>page.evaluate(([name,value])=>window.blitz.action(name,value),[name,value]);
  const cmd=value=>app.evaluate(({},value)=>global.__blitzTest.nativeCommand(null,value),value);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1920,1112);w.showInactive();w.focus();});
  async function sample(name){const file=path.join(out,name+'.png');if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');await cmd({type:'capture',path:file});let result;await until(()=>{try{result=JSON.parse(fs.readFileSync(file+'.json'));return fs.existsSync(file);}catch{return false;}});records.push({name,...result});return result;}
  function check(result){const f=result.renderProbe.fixture;assert.equal(f.error,'');assert.equal(f.buttons.length,8);for(const b of f.buttons){assert(b.definition,'Missing icon '+b.icon);assert(b.bitmapWidth>0&&b.bitmapHeight>0&&b.opaquePixels>0,'Empty native icon '+b.icon);assert(b.visible&&b.parentVisible,'Hidden slot '+b.slot);}}
  for(mode of ['negative','fixed']){
   if(mode==='fixed')await call('restart-game');await until(async()=>!(await call('state')).loading);await wait(2500);
   const initial=await sample(mode+'-initial');assert(initial.renderProbe?.fixture,JSON.stringify(initial));check(initial);assert.equal(initial.testAdapterMode,'original','Unsupported main client stays unmodified');
   assert.equal(initial.testIconRepairs.length,mode==='fixed'?1:0,'Separate local asset interception');
   await cmd({type:'test-transition-control',play:true,transition:false,menu:'forge'});await wait(350);
   const result=await sample(mode+'-affected-icons');assert.equal(result.renderProbe.fixture.error,'');
   if(mode==='negative'){for(const b of result.renderProbe.fixture.buttons.slice(0,2)){assert.equal(b.definition,false);assert.equal(b.bitmapWidth,0);}continue;}
   check(result);assert(result.renderProbe.fixture.aliasPixels.every(x=>x.pixelsMatch),'Aliases reproduce native Meteor/Fireball pixels and bounds');
   for(const size of [[1152,768],[1920,1080],[2560,1440]]){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]+32),size);await wait(750);const r=await sample('fixed-resize-'+size[0]);check(r);assert(r.renderProbe.fixture.aliasPixels.every(x=>x.pixelsMatch));}
   await cmd({type:'test-transition-control',play:true,transition:false,menu:'map'});await wait(250);const empty=await sample('fixed-cleared');assert.equal(empty.renderProbe.fixture.error,'');assert(empty.renderProbe.fixture.buttons.every(b=>b.bitmapWidth===0));
   await cmd({type:'test-transition-control',play:true,transition:false,menu:'none'});await wait(250);
   await cmd({type:'test-transition-control',play:true,transition:false,menu:'forge'});await wait(350);check(await sample('fixed-restored'));
   await cmd({type:'reload'});await wait(2500);await cmd({type:'test-transition-control',play:true,transition:false,menu:'forge'});await wait(350);
   const cached=await sample('fixed-cache-reload');check(cached);assert(cached.renderProbe.fixture.aliasPixels.every(x=>x.pixelsMatch));assert(cached.testIconRepairs.length>=2,'Browser cached response repaired again after revalidation');
   assert(requests.some(r=>r.mode==='fixed'&&r.path==='/assets/UI_1.swf'&&r.conditional),'Exercise actual HTTP 304 revalidation and merged cached response');
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,requests,limits:'No accounts, authentication, SharedObject copies, game sockets or server changes. Snapshot Game/Entity constructors replaced only in an unshipped offline fixture. Original HUD controller, power rasterizer, UI assets and gameplay methods retained. Unknown main-client adapter remains disabled.'},null,2));
  console.log('PASS Local missing-icon native negative control; response repair, exact native pixels/bounds at three resolutions, clear/restore; no accounts/game sockets.');
 }finally{if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
