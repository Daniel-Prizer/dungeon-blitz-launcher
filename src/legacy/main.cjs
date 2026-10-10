'use strict';
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const net = require('net');
const {readMessages}=require('./transport.cjs');
const {editingCommand,pasteIntoFlash}=require('./editing.cjs');
const {patchClient}=require('./client-patch.cjs');
const {classifyLink}=require('./links.cjs');
const {patchAudio}=require('./audio-patch.cjs');
const {rasterPlan}=require('./rendering.cjs');
const audioDeltas=[];
for(const name of ['audio-delta.json','audio-delta-current.json'])try{audioDeltas.push(JSON.parse(require('fs').readFileSync(path.join(process.resourcesPath,name),'utf8')));}catch(_){}
const LIVE = process.env.BLITZ_GAME_URL;
function validGameAddress(value) {
  try { const u=new URL(value);return !u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))); } catch(_){return false;}
}
if(!validGameAddress(LIVE))app.exit(2);
const ORIGIN = new URL(LIVE).origin;
let win, zoom = 1, connected = false, viewport = {width:1200,height:800}, clientIntegration=false, audioIntegration=false;
let audioMix={player:100,music:100,environment:100,creatures:100};
let appliedAudioMix='';
let appliedDisplayKey='',zoomRevision=0,oldRenderingTest=false,renderResolution=1;
let showFPS=false,appliedShowFPS=null;
let widescreen=false,appliedWidescreen=null;
async function applyWidescreen(){
 if(!win||win.isDestroyed()||!clientIntegration||!audioIntegration||appliedWidescreen===widescreen)return;
 const wanted=widescreen;
 const applied=await win.webContents.executeJavaScript(`(() => {const e=document.getElementById('DungeonBlitz');return typeof e?.BlitzSetWidescreen==='function'&&e.BlitzSetWidescreen(${wanted});})()`).catch(()=>false);
 if(applied===true&&widescreen===wanted)appliedWidescreen=wanted;
}
async function applyFPSCounter(){
 if(!win||win.isDestroyed()||appliedShowFPS===showFPS)return;
 const wanted=showFPS;
 const applied=await win.webContents.executeJavaScript(`(() => {const e=document.getElementById('DungeonBlitz');return typeof e?.BlitzShowFPS==='function'&&e.BlitzShowFPS(${wanted});})()`).catch(()=>false);
 if(applied===true&&showFPS===wanted)appliedShowFPS=wanted;
}
async function applyAudioMix(){
 if(!win||win.isDestroyed()||!audioIntegration)return;
 const key=JSON.stringify(audioMix);if(key===appliedAudioMix)return;
 const values=['player','music','environment','creatures'].map(key=>audioMix[key]);
 const applied=await win.webContents.executeJavaScript(`(() => {const e=document.getElementById('DungeonBlitz');return typeof e?.BlitzSetAudio==='function'&&e.BlitzSetAudio(${values.join(',')});})()`).catch(()=>false);
 if(applied===true)appliedAudioMix=key;
}
const queued = [];
const testEdits=[];
const testLinks=[];
function linkTrace(event) { if(process.env.BLITZ_HOST_TEST==='1'&&testLinks.length<100)testLinks.push(event); }
let readPasteText=()=>require('electron').clipboard.readText();
const channel = process.env.BLITZ_HOST_CHANNEL;
const token = process.env.BLITZ_HOST_TOKEN;
if (!channel || !token) app.exit(2);
const pipe = net.connect(channel);
pipe.on('connect', () => { connected = true; pipe.write(JSON.stringify({ type: 'auth', token }) + '\n'); queued.forEach(message => pipe.write(message)); queued.length = 0; });
pipe.on('error', () => app.exit(1));
pipe.on('close', () => { if (win && !win.isDestroyed()) win.destroy(); app.quit(); });
app.setName('Blitz Game Host');
app.setPath('userData', path.join(app.getPath('appData'), process.env.BLITZ_HOST_TEST === '1' ? 'BlitzBrowser-Game-Test' : 'BlitzBrowser-Game'));
app.enableSandbox();
app.commandLine.appendSwitch('ppapi-flash-path', path.join(process.resourcesPath, 'pepflashplayer64.dll'));
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.363');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// This dedicated game HWND is positioned over a separate Chromium owner.
// Disable legacy native occlusion heuristics for that embedded surface; explicit
// hide/background settings still control activity. No clocks or input are changed.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
if (process.env.BLITZ_GAME_ACCELERATION==='0'||(process.env.BLITZ_HOST_TEST === '1' && process.env.BLITZ_PRIVATE_DESKTOP)) {
  app.disableHardwareAcceleration();
}
function emit(data) { const message = JSON.stringify(data) + '\n'; if (connected) pipe.write(message); else queued.push(message); }
function gameURL(url) { try { const u = new URL(url); return u.origin === ORIGIN && !u.username && !u.password; } catch (_) { return false; } }
function sizeGameWindow(width,height){
  if(!win||win.isDestroyed())return;
  const size=win.getContentSize();if(size[0]===width&&size[1]===height)return;
  // Update Electron's fixed-size constraints on its own window thread. The
  // persistent native subclass blocks interactive movement/resizing throughout.
  win.setResizable(true);
  try{win.setContentSize(width,height);}finally{win.setResizable(false);}
}
async function applyZoom() {
  if (!win || win.isDestroyed()) return;
  const revision=++zoomRevision,currentZoom=zoom,currentViewport={...viewport},currentResolution=renderResolution;
  const before=win.webContents.getZoomFactor();
  const probe=await win.webContents.executeJavaScript(`(() => {const e=document.getElementById('DungeonBlitz');return {native:typeof e?.BlitzSetPictureZoom==='function',density:devicePixelRatio/${before}};})()`).catch(()=>null);
  if(revision!==zoomRevision||win.isDestroyed())return;
  const native=clientIntegration&&audioIntegration&&probe?.native&&!oldRenderingTest;
  const density=probe&&Number.isFinite(probe.density)&&probe.density>=.5&&probe.density<=8?probe.density:1;
  // Let Flash allocate its own bitmap at device-pixel resolution. Browser zoom
  // compensates Windows DPI, not game magnification. Only exceptionally large
  // views use a bounded raster plus residual scaling to avoid unsafe allocations.
  const plan=rasterPlan(currentViewport.width,currentViewport.height,currentZoom,density,currentResolution);
  const factor=native?plan.browserZoom:Math.max(.1,Math.min(10,Math.min(currentViewport.width/1152,currentViewport.height/768)*currentZoom));
  // Reapplying an identical page zoom in this legacy Chromium can restore its
  // cached pre-attachment window bounds. Picture zoom belongs inside Flash.
  if(Math.abs(before-factor)>.00001)win.webContents.setZoomFactor(factor);
  sizeGameWindow(currentViewport.width,currentViewport.height);
  const applied = await win.webContents.executeJavaScript(`(() => { const e = document.getElementById('game-container'); if (!e) return false; e.style.cssText = ${JSON.stringify(clientIntegration?'width:100vw;height:100vh;min-width:0;min-height:0;flex:0 0 auto':'width:1152px;height:768px;min-width:1152px;min-height:768px;flex:0 0 auto')}; return true; })()`).catch(() => false);
  if(revision!==zoomRevision)return;
  if(native&&applied){
   const key=JSON.stringify([currentZoom,currentViewport,density,factor]);
   if(key!==appliedDisplayKey){
    const changed=await win.webContents.executeJavaScript(`document.getElementById('DungeonBlitz').BlitzSetPictureZoom(${currentZoom},${factor})`).catch(()=>false);
    if(changed===true&&revision===zoomRevision)appliedDisplayKey=key;
   }
  }
  if(applied)emit({type:'zoom-applied',value:currentZoom,scale:factor});
}
app.whenReady().then(async () => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'fullscreen' && gameURL(wc.getURL())));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'fullscreen' && wc && gameURL(wc.getURL()));
  ses.on('will-download', (event) => event.preventDefault());
  ses.webRequest.onBeforeRequest((details, callback) => {
    // This session can fetch only the explicitly selected game's origin.
    callback({ cancel: !gameURL(details.url) });
  });
  win = new BrowserWindow({ width: 1200, height: 800, minWidth: 1, minHeight: 1, frame: false, thickFrame: false, resizable: false, movable: false, minimizable: false, maximizable: false, show: false, backgroundColor: '#484955', skipTaskbar: true, fullscreenable: false, webPreferences: { plugins: true, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, webSecurity: true, allowRunningInsecureContent: false, enableRemoteModule: false, webviewTag: false, backgroundThrottling: false } });
  // This is an input surface positioned by the launcher, not an independently
  // draggable/resizable window. Removing Win32 styles alone leaves Chromium's
  // frameless hit-test resize borders active.
  // The own-process subclass blocks interactive move/resize. Do not cancel
  // native placement events: our owner uses SetWindowPos to synchronize position.
  require(path.join(process.resourcesPath,'game-window.node')).attach(win.getNativeWindowHandle());
  win.setMenuBarVisibility(false);
  win.on('focus',()=>emit({type:'focused'}));
  // Alt+F4 on the game surface closes its launcher without a confirmation.
  win.on('close', event => {event.preventDefault();emit({type:'close-window'});});
  const wc = win.webContents;
  let lastLink = 0, linkContext = null;
  async function watchHTMLLinks() {
    try {
      await wc.debugger.sendCommand('Page.enable');
      const tree = await wc.debugger.sendCommand('Page.getFrameTree');
      const context = await wc.debugger.sendCommand('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'blitz-link-gestures'});
      linkContext = context.executionContextId;
      await wc.debugger.sendCommand('Runtime.addBinding',{name:'blitzTrustedLink',executionContextId:linkContext});
      await wc.debugger.sendCommand('Runtime.evaluate',{contextId:linkContext,expression:`(() => {
        if(window.__blitzWatchingLinks)return;window.__blitzWatchingLinks=true;
        addEventListener('click', event => {
          if(!event.isTrusted||event.button!==0)return;
          const anchor=event.composedPath().find(el=>el instanceof HTMLAnchorElement&&el.href);
          if(!anchor)return;
          event.preventDefault();blitzTrustedLink(anchor.href);
        },true);
      })()`});
    } catch (_) { linkContext = null; }
  }
  async function routeLink(url, userGesture) {
    const link = classifyLink(url, LIVE);
    linkTrace({url,source:wc.getURL(),userGesture,phase:'route'});
    if (!link || !gameURL(wc.getURL()) || Date.now() - lastLink < 1000) return;
    if (link.type === 'external') {
      // Flash navigateToURL and HTML links share Chromium's user activation.
      const gesture = userGesture === true || await wc.executeJavaScript('navigator.userActivation && navigator.userActivation.isActive === true').catch(() => false);
      linkTrace({url,gesture,phase:'activation'});
      if (gesture !== true || wc.isDestroyed() || !gameURL(wc.getURL()) || Date.now() - lastLink < 1000) return;
      lastLink = Date.now(); emit({type:'external-link',url:link.url,userGesture:true});
    } else {
      lastLink = Date.now(); setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(LIVE).catch(() => {}); });
    }
  }
  // In-process DevTools response interception preserves the selected HTTPS URL,
  // cookies and certificate checks. It opens no debugging port or proxy server.
  // Unknown client revisions continue unmodified instead of applying stale offsets.
  wc.debugger.on('message',async (_event,method,params)=>{
    if(method==='Runtime.bindingCalled'){
      if(params.name==='blitzTrustedLink'&&params.executionContextId===linkContext)void routeLink(params.payload,true);
      return;
    }
    if(method.startsWith('Page.')&&/windowOpen|Navigation/.test(method))linkTrace({method,params});
    if(method==='Page.windowOpen'){if(params.userGesture===true)void routeLink(params.url,true);return;}
    if(method!=='Fetch.requestPaused')return;
    let fulfilled=false;
    try {
      const url=new URL(params.request.url);
      if(url.origin===ORIGIN && /\/DungeonBlitz\.swf$/i.test(url.pathname) && params.responseStatusCode===200) {
        const response=await wc.debugger.sendCommand('Fetch.getResponseBody',{requestId:params.requestId});
        const bytes=Buffer.from(response.body,response.base64Encoded?'base64':'utf8'),presentation=patchClient(bytes),audio=presentation&&audioDeltas.map(delta=>patchAudio(presentation,delta)).find(Boolean),patched=audio||presentation;
        audioIntegration=!!audio;emit({type:'audio-integration',value:audioIntegration});
        if(patched) {
          const headers=(params.responseHeaders||[]).filter(h=>!['content-length','content-encoding','transfer-encoding'].includes(h.name.toLowerCase()));
          headers.push({name:'Content-Length',value:String(patched.length)});
          await wc.debugger.sendCommand('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:headers,body:patched.toString('base64')});fulfilled=true;
          clientIntegration=true;emit({type:'client-integration',value:true});await applyZoom();
        } else {clientIntegration=false;emit({type:'client-integration',value:false});}
      }
    }catch(_){clientIntegration=false;emit({type:'client-integration',value:false});}
    finally {if(!fulfilled&&!wc.isDestroyed())await wc.debugger.sendCommand('Fetch.continueRequest',{requestId:params.requestId}).catch(()=>{});}
  });
  try {wc.debugger.attach('1.3');await wc.debugger.sendCommand('Fetch.enable',{patterns:[{urlPattern:ORIGIN+'/*DungeonBlitz.swf*',requestStage:'Response'}]});}
  catch(_){emit({type:'client-integration',value:false});}
  wc.on('will-attach-webview', e => e.preventDefault());
  wc.on('will-navigate', (event,url) => { event.preventDefault(); void routeLink(url); });
  wc.on('will-redirect', (event,url) => { if (!gameURL(url)) event.preventDefault(); });
  wc.on('new-window', (event,url) => { event.preventDefault(); void routeLink(url); });
  if (wc.setWindowOpenHandler) wc.setWindowOpenHandler(({url}) => { void routeLink(url); return { action: 'deny' }; });
  wc.on('did-start-loading', () => {clientIntegration=false;appliedAudioMix='';appliedDisplayKey='';appliedShowFPS=null;appliedWidescreen=null;emit({ type: 'loading', value: true });});
  wc.on('did-stop-loading', () => emit({ type: 'loading', value: false }));
  wc.on('page-title-updated', (_e, title) => emit({ type: 'title', title }));
  wc.on('dom-ready', applyZoom);
  // Enabling Page before the first navigation can stall this legacy runtime's
  // initial blank renderer. Enable after it has a real document instead.
  wc.on('did-navigate',()=>{linkContext=null;});
  wc.on('did-finish-load',watchHTMLLinks);
  const audioTimer=setInterval(()=>{void applyAudioMix();void applyFPSCounter();void applyWidescreen();if(!appliedDisplayKey)void applyZoom();},1000);win.on('closed',()=>clearInterval(audioTimer));
  wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) emit({ type: 'error', message: description }); });
  wc.on('render-process-gone', () => emit({ type: 'error', message: 'The game process stopped. Reload to reconnect.' }));
  wc.on('enter-html-full-screen', () => { win.setFullScreen(false); emit({ type: 'fullscreen' }); });
  wc.on('before-input-event', (event, input) => {
    const edit=editingCommand(input);
    if(edit){
      event.preventDefault();
      if(process.env.BLITZ_HOST_TEST==='1')testEdits.push(edit);
      // Finish cancelling the shortcut before dispatching its inserted keys.
      setImmediate(()=>{if(!wc.isDestroyed())pasteIntoFlash(wc,readPasteText)});return;
    }
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); emit({ type: 'fullscreen' }); }
    if ((input.control || input.meta) && input.key === ',') { event.preventDefault(); emit({type:'settings'}); }
    if (input.key === 'Escape') emit({type:'escape'});
  });
  const hwnd = win.getNativeWindowHandle();
  emit({ type: 'ready', hwnd: hwnd.length === 8 ? hwnd.readBigUInt64LE().toString() : String(hwnd.readUInt32LE()), electron: process.versions.electron, chromium: process.versions.chrome });
  wc.loadURL(LIVE).catch(() => {});
}).catch(()=>{
  emit({type:'error',message:'The game window could not start. Reconnect to try again.'});
  if(win&&!win.isDestroyed())win.destroy();app.exit(1);
});
readMessages(pipe, async cmd => {
  try {
    if (!win || win.isDestroyed()) return;
    if (cmd.type === 'zoom') { zoom = Math.max(.5, Math.min(3, Number(cmd.value) || 1)); await applyZoom(); }
    if(cmd.type==='render-resolution'&&[.5,.75,1].includes(cmd.value)){renderResolution=cmd.value;await applyZoom();}
    if(cmd.type==='show-fps'&&typeof cmd.value==='boolean'){showFPS=cmd.value;await applyFPSCounter();}
    if(cmd.type==='widescreen'&&typeof cmd.value==='boolean'){widescreen=cmd.value;await applyWidescreen();}
    if(cmd.type==='test-rendering-mode'&&process.env.BLITZ_HOST_TEST==='1'){oldRenderingTest=cmd.value==='old';appliedDisplayKey='';if(oldRenderingTest)await win.webContents.executeJavaScript("document.getElementById('DungeonBlitz')?.BlitzSetPictureZoom?.(1)").catch(()=>{});await applyZoom();}
    if (['viewport','test-viewport'].includes(cmd.type) && Number.isInteger(cmd.width) && Number.isInteger(cmd.height)) {
      viewport={width:Math.max(1,Math.min(8000,cmd.width)),height:Math.max(1,Math.min(8000,cmd.height))};
      // Chromium sizes its own window; NativeHost positions it without resizing.
      sizeGameWindow(viewport.width,viewport.height);
      await applyZoom();
    }
    if (cmd.type === 'mute') win.webContents.setAudioMuted(!!cmd.value);
    if(cmd.type==='audio-mix'&&cmd.value&&['player','music','environment','creatures'].every(key=>Number.isInteger(cmd.value[key])&&cmd.value[key]>=0&&cmd.value[key]<=100)){audioMix=cmd.value;await applyAudioMix();}
    if(cmd.type==='test-audio-fixture'&&process.env.BLITZ_HOST_TEST==='1'){audioIntegration=true;emit({type:'audio-integration',value:true});await applyAudioMix();}
    if(cmd.type==='test-transition-fixture'&&process.env.BLITZ_HOST_TEST==='1'){
      const exists=await win.webContents.executeJavaScript("typeof document.getElementById('DungeonBlitz')?.BlitzTransitionFixtureControl==='function'").catch(()=>false);
      if(exists){clientIntegration=true;audioIntegration=true;emit({type:'client-integration',value:true});emit({type:'audio-integration',value:true});await applyZoom();await applyWidescreen();}
    }
    if(cmd.type==='test-transition-control'&&process.env.BLITZ_HOST_TEST==='1'&&typeof cmd.play==='boolean'&&typeof cmd.transition==='boolean')await win.webContents.executeJavaScript(`document.getElementById('DungeonBlitz').BlitzTransitionFixtureControl(${cmd.play},${cmd.transition})`);
    if(cmd.type==='test-world-control'&&process.env.BLITZ_HOST_TEST==='1'&&Number.isFinite(cmd.pan)&&cmd.pan>=0&&cmd.pan<=1500&&typeof cmd.scene==='boolean'&&typeof cmd.oldCoverage==='boolean'&&(cmd.reuse===undefined||typeof cmd.reuse==='boolean'))await win.webContents.executeJavaScript(`document.getElementById('DungeonBlitz').BlitzWorldFixtureControl(${cmd.pan},${cmd.scene},${cmd.oldCoverage},${cmd.reuse===true})`);
    if (cmd.type === 'background') win.webContents.setBackgroundThrottling(!cmd.value);
    if (cmd.type === 'reload') win.webContents.reload();
    if (cmd.type === 'stop') win.webContents.stop();
    if (cmd.type === 'focus' && win.isVisible()) { win.focus(); win.webContents.focus(); }
    if (cmd.type === 'visibility') { if (cmd.value) win.showInactive(); else win.hide(); }
    if (cmd.type === 'clear-cache') await win.webContents.session.clearCache();
    if (cmd.type === 'clear-data') await win.webContents.session.clearStorageData();
    if (['capture','test-geometry'].includes(cmd.type) && process.env.BLITZ_HOST_TEST === '1' && typeof cmd.path === 'string') {
      const probeStarted=process.hrtime.bigint();
      const geometry=await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('DungeonBlitz'),r=e?.getBoundingClientRect();return{focused:document.hasFocus(),active:document.activeElement?.id,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,fixture:window.__fixtureResult||null,inputProbe:typeof e?.BlitzInputProbe==='function'?e.BlitzInputProbe():null,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}})()`);
      const audioProbe=await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('DungeonBlitz');return typeof e?.BlitzAudioState==='function'?e.BlitzAudioState():null})()`);
      const renderProbe=await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('DungeonBlitz');return typeof e?.BlitzRenderState==='function'?e.BlitzRenderState():null})()`);
      const probeDurationMs=Number(process.hrtime.bigint()-probeStarted)/1e6;
      require('fs').writeFileSync(cmd.path+'.json',JSON.stringify({visible:win.isVisible(),focused:win.isFocused(),contentFocused:win.webContents.isFocused(),windows:BrowserWindow.getAllWindows().length,size:win.getContentSize(),zoom,renderResolution,viewport,scale:win.webContents.getZoomFactor(),clientIntegration,audioIntegration,audioProbe,renderProbe,geometry,testEdits,testLinks,probeDurationMs}));
      if(cmd.type==='capture'){const image = await win.webContents.capturePage(); require('fs').writeFileSync(cmd.path, image.toPNG()); emit({ type: 'captured', path: cmd.path });}
    }
    if (cmd.type === 'test-input' && process.env.BLITZ_HOST_TEST === '1') win.webContents.sendInputEvent(cmd.input);
    if(cmd.type==='test-fps-control'&&process.env.BLITZ_HOST_TEST==='1'&&[30,60,100].includes(cmd.rate)&&Number.isInteger(cmd.busy)&&cmd.busy>=0&&cmd.busy<=100&&typeof cmd.margins==='boolean')await win.webContents.executeJavaScript(`document.getElementById('DungeonBlitz').FPSFixtureControl(${cmd.rate},${cmd.busy},${cmd.margins})`);
    if (cmd.type === 'test-paste-source' && process.env.BLITZ_HOST_TEST === '1' && typeof cmd.text==='string') {
      // Exercise real insertion with dummy data without touching the clipboard.
      readPasteText=()=>cmd.text;
    }
    if (cmd.type === 'quit') { win.destroy(); app.quit(); }
  } catch (_) { emit({ type: 'error', message: 'Invalid game host command.' }); }
});
app.on('window-all-closed', () => app.quit());
