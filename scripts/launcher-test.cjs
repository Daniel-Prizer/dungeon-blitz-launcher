const {_electron:electron}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {LIVE,validSettings}=require('../src/policy.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/launcher-tests');fs.mkdirSync(out,{recursive:true});
const privateDesktop=process.env.BLITZ_NATIVE_TEST==='1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await wait(100)}throw new Error(message)}
(async()=>{
  if(privateDesktop)execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
  fs.mkdirSync(path.join(root,'.test-profile'),{recursive:true});fs.writeFileSync(path.join(root,'.test-profile/preferences.json'),JSON.stringify({settings:validSettings()}));
  const fixtureRequests=[];
  const server=http.createServer((req,res)=>{
    fixtureRequests.push(req.url);
    if(req.url==='/assets/UI_0.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.resolve(root,'../db r/dungeon-blitz-r/src/client/content/localhost/p/cbp/UI_0.swf')));return;}
    if(req.url==='/shortcut-probe.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/input-shortcuts/fixture.swf')));return;}
    if(req.url==='/shortcuts'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="margin:0"><div id="game-container"><object id="DungeonBlitz" data="/shortcut-probe.swf" type="application/x-shockwave-flash" width="1152" height="768"><param name="allowScriptAccess" value="sameDomain"></object></div></body>');return;}
    if(req.url==='/audio-probe.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/audio/fixture.swf')));return;}
    if(req.url==='/audio-fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="margin:0"><div id="game-container"><object id="DungeonBlitz" data="/audio-probe.swf" type="application/x-shockwave-flash" width="1152" height="768"><param name="allowScriptAccess" value="sameDomain"></object></div></body>');return;}
    if(req.url==='/link-probe.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(path.join(root,'.test-tools/focus/link-probe.swf')));return;}
    if(req.url==='/flash-links'){
      res.setHeader('Content-Type','text/html');res.end(`<!doctype html><body style="margin:0"><div id="game-container"><object id="DungeonBlitz" data="/link-probe.swf" type="application/x-shockwave-flash" width="1152" height="768"><param name="allowScriptAccess" value="sameDomain"><param name="flashvars" value="gameURL=${encodeURIComponent('http://127.0.0.1:'+server.address().port+'/flash-links')}"></object></div></body>`);return;
    }
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><body style="margin:0;background:#484955;display:flex;justify-content:center;align-items:center;min-height:100vh"><div id="game-container"><div id="DungeonBlitz" style="width:1152px;height:768px;background:linear-gradient(45deg,#493c20,#8a713c)">Audio isolation fixture</div></div><a style="position:fixed;left:10px;top:10px" target="_blank" href="https://www.paypal.com/donate/?a=1&amp;b=2">PayPal</a><a style="position:fixed;left:10px;top:60px" href="https://www.facebook.com/">Facebook</a><a style="position:fixed;left:10px;top:110px" target="_blank" href="/game-link">Game</a><script>const ctx=new AudioContext();const oscillator=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=0;oscillator.connect(gain).connect(ctx.destination);oscillator.start();ctx.resume();window.__fixtureResult={node:typeof require,process:typeof process,launcher:typeof window.blitz,popup:window.open('https://example.com/')===null};fetch('http://localhost:'+location.port+'/blocked').then(()=>window.__fixtureResult.blocked=false).catch(()=>window.__fixtureResult.blocked=true);</script></body></html>`);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const fixture=`http://127.0.0.1:${server.address().port}/`;
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[root,'--smoke-test',...(privateDesktop?['--private-desktop']:[])],env});
  const checks=[];
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
    const call=(n,v)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[n,v]);
    const shellKey=keyCode=>app.evaluate(({BrowserWindow},keyCode)=>{const wc=BrowserWindow.getAllWindows()[0].webContents;for(const type of ['keyDown','keyUp'])wc.sendInputEvent({type,keyCode});},keyCode);
    if(privateDesktop){await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.showInactive();win.focus()});}
    await wait(15000);assert.equal((await call('state')).error,'');assert.equal((await call('state')).gameURL,LIVE);
    assert.equal(app.context().pages().length,1,'There is only the local launcher renderer, no browser tabs');
    assert.equal(await page.locator('#address,#tabs,#back,#bookmark,#status').count(),0);
    assert.equal(await page.locator('#upscaler,#neural-compare,#upscaler-status,#presentation-fps').count(),0,'Retired enhancement controls must be absent');
    assert(!('presentation' in await call('state')),'Retired enhancement status must be absent');
    assert.deepEqual(await page.evaluate(()=>({require:typeof require,process:typeof process})),{require:'undefined',process:'undefined'});
    for(const action of ['new-tab','navigate','home','bookmark','download'])assert.equal((await call(action,LIVE)).ok,false);
    checks.push('Dedicated launcher autostarts live game, removes browser actions, sandboxed UI');
    const command=cmd=>app.evaluate(({},cmd)=>global.__blitzTest.nativeCommand(null,cmd),cmd);
    async function measure(name,capture=false){
      const file=path.join(out,name+(capture?'.png':''));if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');
      if(capture&&fs.existsSync(file))fs.unlinkSync(file);
      await command({type:capture?'capture':'test-geometry',path:file});await until(()=>fs.existsSync(file+'.json'),'Game geometry missing');return {file,...JSON.parse(fs.readFileSync(file+'.json','utf8'))};
    }
    if(privateDesktop){await app.evaluate(()=>global.__blitzTest.runtime().focus());await wait(600)}
    const live=await measure(privateDesktop?'native-live':'hidden-live',true);
    await until(()=>fs.existsSync(live.file),'Live capture missing');assert(fs.statSync(live.file).size>100000,'Real Flash login screen must render');
    assert(live.clientIntegration,'Reviewed live client integration must be active');
    assert.equal(live.testClientHash,require('../src/legacy/client-layout-latest.json').inputHash,'Fresh network must exercise the latest deployed client');
    assert(live.audioIntegration&&live.audioProbe?.initialized,'Live Flash client must expose its reviewed audio adapter');
    assert.deepEqual(live.audioProbe.levels,{player:1,music:1,environment:1,creatures:1});
    assert(live.geometry.rect&&Math.abs(live.geometry.rect.width*live.scale-live.size[0])<2&&Math.abs(live.geometry.rect.height*live.scale-live.size[1])<2,'Flash stage covers the complete game window');
    if(privateDesktop)assert(live.focused&&live.contentFocused&&live.geometry.focused,'Native game must be focused');
    checks.push('Original Flash renders live game; full-window input stage'+(privateDesktop?' and native input focus':''));
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
    const section=name=>page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.locator('#volume').getAttribute('min'),'0');assert.equal(await page.locator('#volume').getAttribute('max'),'100');assert.equal(await page.locator('#volume').getAttribute('step'),'1');
    assert.equal(await page.locator('#volume').inputValue(),'100');assert.equal(await page.locator('#unlock-key').getAttribute('data-code'),'AltLeft');assert.equal(await page.locator('#cursor-lock').isChecked(),false);
    await section('Updates');assert.equal(await page.locator('#auto-updates').isChecked(),true);
    await page.locator('#auto-updates').uncheck();await until(async()=> (await call('state')).settings.autoUpdates===false,'Update opt-out not saved');
    await page.locator('#auto-updates').check();await until(async()=> (await call('state')).settings.autoUpdates===true,'Updates not re-enabled');
    assert.equal((await call('save-settings',{autoUpdates:'yes'})).ok,false);
    checks.push('Actual automatic-update checkbox saves both choices and rejects malformed values');
    await section('Audio');for(const bus of ['player','music','environment','creatures']){
      const slider=page.locator('#audio-'+bus);assert.equal(await slider.inputValue(),'100');assert.equal(await slider.getAttribute('step'),'1');assert.equal(await slider.isEnabled(),true);
      await slider.press('Home');await until(async()=> (await call('state')).settings.audioMix[bus]===0,'Sound bus zero not saved');
      await slider.press('ArrowRight');await until(async()=> (await call('state')).settings.audioMix[bus]===1,'Sound bus one-step increment not saved');
      await slider.press('End');await until(async()=> (await call('state')).settings.audioMix[bus]===100,'Sound bus reset not saved');
    }
    await call('save-settings',{audioMix:{player:17,music:29,environment:43,creatures:61}});await wait(1200);
    assert.deepEqual((await measure('live-audio-mix')).audioProbe.levels,{player:.17,music:.29,environment:.43,creatures:.61});
    await call('save-settings',{audioMix:{player:100,music:100,environment:100,creatures:100}});
    checks.push('All four category sliders start at 100, step by 1, and reach the actual live Flash audio adapter');
    assert.equal(await page.locator('#titlebar').evaluate(el=>el.getBoundingClientRect().height),32);
    assert(await page.locator('.wordmark').evaluate(el=>el.complete&&el.naturalWidth>0),'Actual titlebar wordmark loads');
    async function bind(code){await section('Controls');await page.locator('#unlock-key').click();await until(async()=> (await call('state')).capturingShortcut,'Shortcut capture must arm');await page.locator('#unlock-key').press(code);await until(async()=> !(await call('state')).capturingShortcut,'Shortcut capture must finish');}
    if(privateDesktop)assert.equal((await measure('hidden-in-settings')).visible,false);
    await page.locator('#volume').focus();await page.locator('#volume').press('Home');await until(async()=> (await call('state')).settings.volume===0,'Volume zero not saved');
    await page.locator('#volume').press('ArrowRight');await until(async()=> (await call('state')).settings.volume===1,'Volume increment not saved');
    await page.locator('#volume-number').fill('37');await until(async()=> (await call('state')).settings.volume===37,'Volume 37 not saved');
    await section('Controls');await page.locator('#cursor-lock').check();await until(async()=> (await call('state')).settings.cursorLock,'Cursor checkbox not saved');
    await bind('F8');await until(async()=> (await call('state')).settings.unlockKey==='F8','Shortcut not saved');
    await bind('g');await until(async()=> (await call('state')).settings.unlockKey==='KeyG','Letter shortcut not saved');
    await page.locator('#unlock-key').click();await until(async()=> (await call('state')).capturingShortcut,'Capture arm');await page.locator('#unlock-key').press('F11');assert.equal((await call('state')).fullscreen,false,'Reserved F11 during capture must not enter fullscreen');await page.locator('#unlock-key').press('Escape');await until(async()=> !(await call('state')).capturingShortcut,'Escape cancels capture');assert.equal((await call('state')).settings.unlockKey,'KeyG');
    await bind('F8');await until(async()=> (await call('state')).settings.unlockKey==='F8','Reset F8');
    if(privateDesktop){
      await until(async()=> (await call('state')).cursor.enabled,'Native cursor settings not applied');
      assert.equal((await call('state')).cursor.active,false,'Cursor never confines in settings');assert.equal((await call('state')).cursor.dryRun,true);
      const savedLock=()=>JSON.parse(fs.readFileSync(path.join(root,'.test-profile/preferences.json'),'utf8')).settings.cursorLock;
      await page.locator('#toggle-cursor').click();await until(async()=> !(await call('state')).settings.cursorLock&&!(await call('state')).cursor.enabled,'Release button must uncheck and save');
      assert.equal(await page.locator('#cursor-lock').isChecked(),false);assert.equal(savedLock(),false);
      await page.locator('#toggle-cursor').click();await until(async()=> (await call('state')).settings.cursorLock&&(await call('state')).cursor.enabled,'Relock button must check and save');
      const host=line=>app.evaluate(({},line)=>global.__blitzTest.runtime().testHost(line),line);
      await host('TESTKEY 119 1 1');await until(async()=> !(await call('state')).settings.cursorLock,'Native custom key must disable saved checkbox');
      await host('TESTKEY 119 1 1');await wait(100);assert.equal((await call('state')).settings.cursorLock,false,'Saved-setting acknowledgement cannot turn a repeat into a new toggle');
      await host('TESTKEY 119 0 1');await host('TESTKEY 119 1 1');await until(async()=> (await call('state')).settings.cursorLock,'Custom key must enable saved checkbox');await host('TESTKEY 119 0 1');
      await bind('AltLeft');await until(async()=> (await call('state')).settings.unlockKey==='AltLeft','Alt save');
      await host('TESTKEY 164 1 1');await host('TESTKEY 164 0 1');await until(async()=> !(await call('state')).settings.cursorLock,'Native Alt release must disable saved checkbox');
      assert.equal(await page.locator('#cursor-lock').isChecked(),false);assert.equal(savedLock(),false);
      await host('TESTKEY 164 1 1');await host('TESTKEY 164 0 1');await until(async()=> (await call('state')).settings.cursorLock&&(await call('state')).cursor.enabled,'Alt must also enable an unchecked saved checkbox');
      assert.equal(await page.locator('#cursor-lock').isChecked(),true);assert.equal(savedLock(),true);
      for(const key of [9,115]){await host('TESTKEY 164 1 1');await host('TESTKEY '+key+' 1 1');await host('TESTKEY 164 0 1');}
      await wait(100);assert.equal((await call('state')).settings.cursorLock,true,'Alt+Tab and Alt+F4 cannot toggle checkbox');
    }
    checks.push('Actual settings controls, 0/1/37 volume, checkbox, shortcut selection and release button');
    await page.screenshot({path:path.join(out,privateDesktop?'settings-native.png':'settings.png')});
    const initialSize=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentSize());
    for(const size of [[800,600],[1440,900]]){
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),size);await wait(300);
      for(const section of ['Audio','Controls','Display','Connection','Updates']){
        await page.getByRole('button',{name:section,exact:true}).click();await wait(350);
        const layout=await page.evaluate(()=>{
          const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
          return {height:innerHeight,width:innerWidth,panel:rect('.panel'),nav:rect('.settings-nav'),done:rect('#done'),content:rect('#settings-content'),horizontal:document.documentElement.scrollWidth>innerWidth};
        });
        assert.equal(layout.horizontal,false);assert(layout.panel.bottom<=layout.height&&layout.panel.top>=32);assert(layout.done.bottom<=layout.height&&layout.done.top>layout.nav.bottom,'Heading, navigation and Back to game must remain reachable');
      }
      await page.screenshot({path:path.join(out,`settings-${size[0]}x${size[1]}.png`)});
    }
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),initialSize);await wait(300);
    await call('dismiss');await until(async()=>{const frame=await measure('settings-resize-restored');return frame.geometry.width===frame.viewport.width&&frame.geometry.height===frame.viewport.height;},'Returning from resized Settings must synchronize the native viewport');
    await call('settings');await section('Display');await wait(350);
    checks.push('Settings navigation at 800x600 and 1440x900 preserves heading/footer, fits horizontally and scrolls each section');
    await page.locator('#game-zoom').selectOption('1.5');await wait(400);const enlarged=await measure('scale-150');
    assert(enlarged.renderProbe&&live.renderProbe,'Reviewed native raster adapter must be active');
    assert.equal(enlarged.renderProbe.zoom,1.5);
    assert(enlarged.renderProbe.nativeScale*enlarged.scale>live.renderProbe.nativeScale*live.scale*1.45,'Game magnification must increase inside Flash');
    assert(enlarged.renderProbe.bitmapWidth>live.renderProbe.bitmapWidth*1.45,'Magnification must allocate real game pixels');
    await page.locator('#game-zoom').selectOption('1');await page.getByRole('button',{name:'Back to game'}).click();await wait(600);
    if(privateDesktop){const restored=await measure('focus-restored');assert(restored.focused&&restored.contentFocused&&restored.geometry.focused);}
    await page.getByRole('button',{name:'Fullscreen',exact:true}).click();await wait(600);assert.equal((await call('state')).fullscreen,true);
    assert.equal(await page.locator('#titlebar').isVisible(),false);assert.equal(await page.locator('#surface').evaluate(el=>el.getBoundingClientRect().y),0);
    const full=await measure('fullscreen');const size=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentSize());assert.deepEqual(full.viewport,{width:size[0],height:size[1]});
    if(privateDesktop){assert(full.focused);assert.equal(await app.evaluate(()=>global.__blitzTest.runtime().shellFullscreen.requested),true);}
    for(const type of ['keyDown','keyUp'])await command({type:'test-input',input:{type,keyCode:'Escape'}});
    await wait(400);assert.equal((await call('state')).fullscreen,true,'Escape belongs to the game and must keep fullscreen');
    await shellKey('Escape');assert.equal((await call('state')).fullscreen,true,'Shell Escape must also keep fullscreen');
    await command({type:'test-input',input:{type:'keyDown',keyCode:'F11'}});await wait(400);assert.equal((await call('state')).fullscreen,false);
    await command({type:'test-input',input:{type:'keyUp',keyCode:'F11'}});
    await call('fullscreen');await wait(400);await call('settings');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await wait(400);await shellKey('Escape');await wait(400);
    assert.equal((await call('state')).modal,null,'Escape closes launcher Settings');assert.equal((await call('state')).fullscreen,true,'Closing Settings preserves fullscreen');
    await call('exit-fullscreen');await wait(400);
    checks.push('Rendered game scale, native focus restoration, fullscreen button/F11, Escape reaches game and keeps fullscreen, Escape closes Settings without exiting fullscreen');
    await page.getByRole('button',{name:'Settings',exact:true}).click();await section('Connection');await page.locator('#game-url').fill('file:///C:/Windows/system.ini');await page.locator('#apply-url').click();await wait(200);assert.equal((await call('state')).settings.gameURL,LIVE);
    await page.locator('#game-url').fill(fixture);await page.locator('#apply-url').click();await until(async()=> (await call('state')).pendingURL,'New URL not saved');assert.equal((await call('state')).gameURL,LIVE,'URL edit must not navigate current game');
    await page.locator('#reconnect').click();await until(async()=> !(await call('state')).loading,'Fixture did not start');await wait(1000);assert.equal((await call('state')).gameURL,fixture);assert.equal((await call('state')).error,'');
    const fixtureFrame=await measure('fixture-boundaries');assert.equal(fixtureFrame.windows,1,'Popup attempt must not create another native window');assert.deepEqual({...fixtureFrame.geometry.fixture,popup:undefined},{node:'undefined',process:'undefined',launcher:'undefined',popup:undefined,blocked:true});assert(!fixtureRequests.includes('/blocked'),'Cross-origin fetch must be denied before it reaches the server');
    checks.push('Selected-origin runtime denies cross-origin requests and popups; game has no Node or launcher API');
    const opened=()=>app.evaluate(()=>global.__blitzTest.externalLinks.slice());
    assert.deepEqual(await opened(),[],'An unsolicited popup must not launch the default browser');
    async function clickGame(x,y){
      for(const type of ['mouseDown','mouseUp'])await command({type:'test-input',input:{type,x:Math.round(x),y:Math.round(y),button:'left',clickCount:1}});
    }
    const scale=fixtureFrame.scale;
    await clickGame(25*scale,18*scale);await until(async()=> (await opened()).length===1,'Clicked external popup handoff missing');
    assert.deepEqual(await opened(),['https://www.paypal.com/donate/?a=1&b=2']);await wait(1100);
    await clickGame(25*scale,68*scale);await until(async()=> (await opened()).length===2,'Clicked same-window external handoff missing');
    assert.equal((await opened())[1],'https://www.facebook.com/');assert.equal((await call('state')).error,'');await wait(1100);
    const reloads=fixtureRequests.filter(u=>u==='/').length;
    await clickGame(25*scale,118*scale);await until(()=>fixtureRequests.filter(u=>u==='/').length>reloads,'Game link must reload configured page');
    assert(!fixtureRequests.includes('/game-link'),'Game links must not replace the game page');
    assert.equal((await measure('after-links')).windows,1);assert.equal((await opened()).length,2,'Reload must not forward its unsolicited popup');
    checks.push('Clicked HTML popup/self links hand off exact web URLs; game links reload; unsolicited popups stay blocked; no OS browser launched');
    if(privateDesktop){
      const actuals=[];
      console.log('Fixture audio state',JSON.stringify((await call('state')).audio));
      await until(async()=> (await call('state')).audio?.sessions?.length,'Silent fixture must create a real game audio session');
      for(const volume of [0,1,37,100]){
        await call('save-settings',{volume});const audio=await until(async()=>{const a=(await call('state')).audio;return a?.requested===volume&&a.sessions.length&&a.sessions.every(s=>Math.abs(s.volume-volume/100)<.0001)?a:null},'Actual game audio session volume did not change');actuals.push(audio);
      }
      fs.writeFileSync(path.join(out,'audio-results.json'),JSON.stringify(actuals,null,2));checks.push('Windows audio sessions read back actual 0/1/37/100 attenuation on silent game-process fixture');
    }
    checks.push('Invalid URL rejected; saved local URL is applied only by explicit reconnect');
    if(fs.existsSync(path.join(root,'.test-tools/focus/link-probe.swf'))){
      const flashURL=fixture+'flash-links';await call('save-settings',{gameURL:flashURL});await call('restart-game');await wait(2000);
      const flash=await measure('flash-link-fixture');assert(flash.geometry.rect,'Flash link fixture must load');
      // The probe uses actual Flash navigateToURL from MouseUp, not HTML links.
      await clickGame(80*flash.scale,50*flash.scale);await until(async()=> (await opened()).length===3,'Flash external link handoff missing');assert.equal((await opened())[2],'https://www.paypal.com/donate/?from=flash');
      await wait(1100);const count=fixtureRequests.filter(u=>u==='/flash-links').length;
      await clickGame(260*flash.scale,50*flash.scale);await until(()=>fixtureRequests.filter(u=>u==='/flash-links').length>count,'Flash game link must reload');
      assert(!fixtureRequests.includes('/flash-links/other'));assert.equal((await measure('flash-after-links')).windows,1);
      checks.push('Original Flash MouseUp/navigateToURL opens external URL and reloads game URL, without creating popup windows');
    }
    await call('save-settings',{gameURL:fixture+'audio-fixture'});await call('restart-game');await wait(2000);await command({type:'test-audio-fixture'});await wait(500);
    const mixChecks=[];
    for(const bus of ['player','music','environment','creatures'])for(const value of [0,1,37,100]){
      const mix={player:100,music:100,environment:100,creatures:100};mix[bus]=value;await call('save-settings',{audioMix:mix});
      const probe=await until(async()=>{const p=(await measure('silent-audio-readback')).audioProbe;return p&&p.samples.length===4&&p.samples.every(s=>Math.abs(s.volume-(s.bus==='music'?.8:1)*mix[s.bus]/100)<.010001)?p:null},'Flash category gains must match actual independent SoundChannel volumes within native 1% quantization');
      assert.equal(probe.contextDepth,0,'Emitter context must not leak');mixChecks.push({bus,value,probe});
    }
    fs.writeFileSync(path.join(out,'mixer-results.json'),JSON.stringify(mixChecks,null,2));checks.push('16 silent Flash mixer readbacks prove independent bus gains, zero/unmute, active loops and uncompounded stream fade gain');
    if(privateDesktop){
      await call('save-settings',{gameURL:fixture+'shortcuts',shiftMount:false,unlockKey:'AltLeft'});await call('restart-game');await wait(2000);
      const control=async value=>{await command({type:'test-shortcut-control',value});await wait(100);};
      const key=async(keyCode,modifiers=[])=>{for(const type of ['keyDown','keyUp'])await command({type:'test-input',input:{type,keyCode,modifiers}});await wait(250);};
      const probe=async()=>(await measure('shortcut-keys')).geometry.inputProbe;
      await until(async()=>{const p=await probe();if(p?.error)throw Error('Shortcut fixture '+p.phase+': '+p.error);return p?.phase==='ready';},'Real key manager fixture must initialize');await command({type:'test-shortcut-fixture'});await wait(200);
      await clickGame(600,300);await wait(200);
      await control('play');assert.equal((await probe()).key,56,'Actual reviewed client defaults Mount to 8');assert.equal((await probe()).mountCommand,12);
      await key('Shift',['left']);assert.equal((await probe()).events.filter(e=>e.command===12).length,0,'Disabled alias must do nothing');
      await call('settings');await section('Controls');const checkbox=page.locator('#shift-mount');await checkbox.check();await until(async()=>(await call('state')).settings.shiftMount,'Mount checkbox saves');
      assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.test-profile/preferences.json'))).settings.shiftMount,true);
      assert.equal((await call('save-settings',{shiftMount:'yes'})).ok,false);assert.equal((await call('save-settings',{unlockKey:'ShiftLeft'})).ok,false,'Shortcut conflict must be explained');
      await call('dismiss');await wait(500);await control('play');await key('Shift',['left']);
      let p=await probe();assert.deepEqual(p.events.filter(e=>e.command===12).map(e=>[e.type,e.code]),[['keyDown',56],['keyUp',56]],'Left Shift sends exactly one paired current mount key');
      await control('rebind');await key('Shift',['left']);p=await probe();assert.deepEqual(p.events.filter(e=>e.command===12).map(e=>[e.type,e.code]),[['keyDown',81],['keyUp',81]],'Alias follows actual in-game rebind to Q');
      await control('play');await key('8');assert.equal((await probe()).events.filter(e=>e.command===12&&e.type==='keyDown').length,1,'Original mount key still works');
      for(const mode of ['login','capture','unbound','typing']){await control(mode);await key('Shift',['left']);assert.equal((await probe()).events.filter(e=>e.command===12).length,0,mode+' must not mount');}
      await command({type:'test-input',input:{type:'char',keyCode:'A'}});await wait(200);assert.equal((await probe()).text,'A','Typing stays available');
      // Electron 11 sendInputEvent derives dom_code solely from generic Shift;
      // even modifiers:['right'] produces ShiftLeft. Right-side filtering is
      // covered by the pure production-policy test, without physical OS input.
      await control('play');
      await key('Shift',['left','control']);assert.equal((await probe()).events.filter(e=>e.command===12).length,0,'Shift chord must not mount');
      await control('play');for(let i=0;i<4;i++)await command({type:'test-input',input:{type:'keyDown',keyCode:'Shift',modifiers:['left']}});await wait(400);
      await command({type:'test-input',input:{type:'keyUp',keyCode:'Shift',modifiers:['left']}});assert.equal((await probe()).events.filter(e=>e.command===12&&e.type==='keyDown').length,1,'Held Shift cannot repeat mounting');
      await control('menu');await call('fullscreen');await wait(400);await key('Escape');assert.equal((await call('state')).fullscreen,true);assert.equal((await probe()).panel,false,'Escape must reach Flash stage to close its panel');
      await call('exit-fullscreen');await call('settings');await checkbox.uncheck();await until(async()=>!(await call('state')).settings.shiftMount,'Mount opt-out saves');await call('dismiss');await wait(400);await control('play');await key('Shift',['left']);assert.equal((await probe()).events.filter(e=>e.command===12).length,0);
      checks.push('Real Flash stage Esc remains fullscreen; actual reviewed key manager and new helper prove opt-in Left Shift/current mount rebind, one paired event, original key, typing/login/capture/unbound/chord guards and saved checkbox; right-side filtering separately unit-tested');
    }
    await call('save-settings',{gameURL:LIVE,volume:100,cursorLock:false,unlockKey:'AltLeft',gameZoom:1,shiftMount:false});
    const stored=JSON.parse(fs.readFileSync(path.join(root,'.test-profile/preferences.json'),'utf8'));assert.equal(stored.settings.volume,100);assert(!stored.tabs&&!stored.history);
    fs.writeFileSync(path.join(out,privateDesktop?'native-results.json':'hidden-results.json'),JSON.stringify({time:new Date().toISOString(),version:(await call('state')).version,checks,live,full,limitation:'No desktop mouse/keyboard events or clipboard used. Cursor confinement is dry-run; its real state machine and native settings/key routing are tested without calling ClipCursor. The inactive desktop has no Explorer; taskbar visibility and authenticated dungeon play are not verified.'},null,2));
    for(const check of checks)console.log('PASS',check);
  }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{});await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
