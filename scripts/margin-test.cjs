const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/margin-tests');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<120;i++){const v=await fn();if(v)return v;await wait(100)}throw new Error('Timed out waiting for Flash integration');}
(async()=>{
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const server=http.createServer((request,response)=>{
  if(request.url.startsWith('/p/cbp/DungeonBlitz.swf')){response.setHeader('Content-Type','application/x-shockwave-flash');return response.end(fs.readFileSync(path.join(root,'.test-tools/focus/input-probe.swf')));}
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#game-container{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important}#DungeonBlitz{display:block;width:100%;height:100%}</style></head><body><div id="game-container"><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/p/cbp/DungeonBlitz.swf"><param name="movie" value="/p/cbp/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></div></body></html>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
 const frames=[],clicks=[],probeClicks=[];
 try {
  const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
  const call=(n,v)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[n,v]);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(2048,750);w.showInactive();w.focus();});
  await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',gameZoom:1,cursorLock:false,volume:100});await call('restart-game');
  await until(async()=>!(await call('state')).loading&&(await call('state')).clientIntegration===true);await wait(10000);
  await app.evaluate(()=>global.__blitzTest.runtime().focus());await wait(500);
  const command=cmd=>app.evaluate(({},v)=>global.__blitzTest.nativeCommand(null,v),cmd);
  const input=data=>command({type:'test-input',input:data});
  async function measure(name,capture=false){
   const file=path.join(out,name+(capture?'.png':''));if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');
   await command({type:capture?'capture':'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json'));
   if(capture)await until(()=>fs.existsSync(file));return {file,...JSON.parse(fs.readFileSync(file+'.json','utf8'))};
  }
  async function click(x,y){await input({type:'mouseMove',x,y});await input({type:'mouseDown',button:'left',x,y,clickCount:1});await input({type:'mouseUp',button:'left',x,y,clickCount:1});await wait(120);}
  const spans=[];
  for(const factor of [.5,.75,1,1.5]) {
   await call('save-settings',{gameZoom:factor});await wait(1300);
   const frame=await measure('scale-'+factor,true);assert(frame.clientIntegration);assert(frame.focused&&frame.contentFocused);
   assert(Math.abs(frame.geometry.rect.width*frame.scale-frame.size[0])<2);assert(Math.abs(frame.geometry.rect.height*frame.scale-frame.size[1])<2);
   const span=await app.evaluate(({nativeImage},file)=>{
    const image=nativeImage.createFromPath(file),{width,height}=image.getSize(),pixels=image.toBitmap();let first=width,last=-1;
    // At 50% the picture does not intersect the old 30%/70% scanlines.
    // Measure its complete rendered bounds instead of empty background rows.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(Math.abs(pixels[i]-85)+Math.abs(pixels[i+1]-73)+Math.abs(pixels[i+2]-72)>30){first=Math.min(first,x);last=Math.max(last,x);}}
    if(last<first)throw new Error('A detailed game picture must be present');return last-first+1;
   },frame.file);
   spans.push({factor,span});frames.push(frame);
   for(const [edge,x] of [['left',2],['right',frame.size[0]-3]]) {
    await click(x,Math.floor(frame.size[1]/2));const m=await measure('live-'+factor+'-'+edge);
    assert(m.focused&&m.contentFocused&&m.geometry.focused);assert.equal(m.geometry.active,'DungeonBlitz','Margin click stays inside the Flash plugin');clicks.push({factor,edge,focused:m.focused,active:m.geometry.active});
   }
  }
  const base=spans.find(x=>x.factor===1).span;for(const item of spans)assert(Math.abs(item.span/base-item.factor)<.035,'Rendered picture scale must change without the responsive Flash stage cancelling it: '+JSON.stringify(spans));
  console.log('PASS Live full-window Flash surface, left/right clicks and rendered picture scale',JSON.stringify(spans));
  await call('save-settings',{gameURL:`http://127.0.0.1:${server.address().port}/`,gameZoom:1});await call('restart-game');
  let initial;await until(async()=>{try{initial=await measure('probe-ready');return initial.geometry.inputProbe;}catch{return false;}});
  await app.evaluate(()=>global.__blitzTest.runtime().focus());await wait(300);
  let count=0;
  for(const factor of [.5,1,1.5,3]) {
   await call('save-settings',{gameZoom:factor});await wait(500);const m=await measure('probe-scale-'+factor);
   for(const [edge,x] of [['left',2],['right',m.size[0]-3]]){
    const y=Math.floor(m.size[1]/2);await click(x,y);const after=await measure('probe-'+factor+'-'+edge);count++;
    const probe=after.geometry.inputProbe;assert.equal(probe.downs,count);assert.equal(probe.ups,count);
    assert(Math.abs(probe.lastX-x/after.scale)<2,'Flash receives native unclamped horizontal aiming coordinate');assert(Math.abs(probe.lastY-y/after.scale)<2);
    assert(after.focused&&after.geometry.active==='DungeonBlitz');probeClicks.push({factor,edge,probe});
   }
  }
  const savedURL='https://dungeonblitzr.theminesa.studio/';await call('save-settings',{gameURL:savedURL,gameZoom:1,cursorLock:false,volume:100});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:(await call('state')).version,time:new Date().toISOString(),spans,clicks,probeClicks,frames,passed:['Actual live Flash plugin covers all margins and stays focused after both side clicks at four scales','Rendered live picture scales at 50/75/100/150 percent','Separate Flash stage probe receives actual MouseDown/MouseUp and unclamped aim coordinates on both margins at 50/100/150/300 percent'],limitation:'Renderer input is injected only into guarded inactive-desktop test windows. No OS pointer/keyboard input, cursor confinement, clipboard or authentication is used. The reviewed focus-splash method is verified as an empty routine by decompilation; authenticated combat and background focus overlay visuals are not independently exercised.'},null,2));
  console.log('PASS Real Flash MouseDown/MouseUp and aiming coordinates in both margins at every tested scale');
 }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
