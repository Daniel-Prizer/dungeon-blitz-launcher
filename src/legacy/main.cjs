'use strict';
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const readline = require('readline');
const net = require('net');
const {editingCommand,pasteIntoFlash}=require('./editing.cjs');
const {patchClient}=require('./client-patch.cjs');
const LIVE = process.env.BLITZ_GAME_URL;
function validGameAddress(value) {
  try { const u=new URL(value);return !u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))); } catch(_){return false;}
}
if(!validGameAddress(LIVE))app.exit(2);
const ORIGIN = new URL(LIVE).origin;
let win, zoom = 1, connected = false, viewport = {width:1200,height:800}, clientIntegration=false;
const queued = [];
const testEdits=[];
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
if (process.env.BLITZ_HOST_TEST === '1' && process.env.BLITZ_PRIVATE_DESKTOP) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
}
function emit(data) { const message = JSON.stringify(data) + '\n'; if (connected) pipe.write(message); else queued.push(message); }
function gameURL(url) { try { const u = new URL(url); return u.origin === ORIGIN && !u.username && !u.password; } catch (_) { return false; } }
async function applyZoom() {
  if (!win || win.isDestroyed()) return;
  // Reviewed clients retain the fixed picture layout inside a full-window
  // Flash stage, so letterbox margins receive ordinary native Flash input.
  const factor = Math.max(.1,Math.min(10,Math.min(viewport.width/1152,viewport.height/768)*zoom));
  win.webContents.setZoomFactor(factor);
  const applied = await win.webContents.executeJavaScript(`(() => { const e = document.getElementById('game-container'); if (!e) return false; e.style.cssText = ${JSON.stringify(clientIntegration?'width:100vw;height:100vh;min-width:0;min-height:0;flex:0 0 auto':'width:1152px;height:768px;min-width:1152px;min-height:768px;flex:0 0 auto')}; return true; })()`).catch(() => false);
  if(applied)emit({type:'zoom-applied',value:zoom,scale:factor});
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
  win.on('will-move',event=>event.preventDefault());
  win.on('will-resize',event=>event.preventDefault());
  require(path.join(process.resourcesPath,'game-window.node')).attach(win.getNativeWindowHandle());
  win.setMenuBarVisibility(false);
  win.on('focus',()=>emit({type:'focused'}));
  // Alt+F4 on the game surface closes its launcher without a confirmation.
  win.on('close', event => {event.preventDefault();emit({type:'close-window'});});
  const wc = win.webContents;
  // In-process DevTools response interception preserves the selected HTTPS URL,
  // cookies and certificate checks. It opens no debugging port or proxy server.
  // Unknown client revisions continue unmodified instead of applying stale offsets.
  wc.debugger.on('message',async (_event,method,params)=>{
    if(method!=='Fetch.requestPaused')return;
    let fulfilled=false;
    try {
      const url=new URL(params.request.url);
      if(url.origin===ORIGIN && /\/DungeonBlitz\.swf$/i.test(url.pathname) && params.responseStatusCode===200) {
        const response=await wc.debugger.sendCommand('Fetch.getResponseBody',{requestId:params.requestId});
        const bytes=Buffer.from(response.body,response.base64Encoded?'base64':'utf8'),patched=patchClient(bytes);
        if(patched) {
          const headers=(params.responseHeaders||[]).filter(h=>!['content-length','content-encoding','transfer-encoding'].includes(h.name.toLowerCase()));
          headers.push({name:'Content-Length',value:String(patched.length)});
          await wc.debugger.sendCommand('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:headers,body:patched.toString('base64')});fulfilled=true;
          clientIntegration=true;emit({type:'client-integration',value:true});await applyZoom();
        } else emit({type:'client-integration',value:false});
      }
    }catch(_){emit({type:'client-integration',value:false});}
    finally {if(!fulfilled&&!wc.isDestroyed())await wc.debugger.sendCommand('Fetch.continueRequest',{requestId:params.requestId}).catch(()=>{});}
  });
  try {wc.debugger.attach('1.3');await wc.debugger.sendCommand('Fetch.enable',{patterns:[{urlPattern:ORIGIN+'/*DungeonBlitz.swf*',requestStage:'Response'}]});}
  catch(_){emit({type:'client-integration',value:false});}
  wc.on('will-attach-webview', e => e.preventDefault());
  const guard = (event, url) => { if (!gameURL(url)) event.preventDefault(); };
  wc.on('will-navigate', guard); wc.on('will-redirect', guard);
  wc.on('new-window', event => event.preventDefault());
  if (wc.setWindowOpenHandler) wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('did-start-loading', () => emit({ type: 'loading', value: true }));
  wc.on('did-stop-loading', () => emit({ type: 'loading', value: false }));
  wc.on('page-title-updated', (_e, title) => emit({ type: 'title', title }));
  wc.on('dom-ready', applyZoom);
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
readline.createInterface({ input: pipe }).on('line', async line => {
  if (line.length > 16384) return;
  try {
    const cmd = JSON.parse(line);
    if (!win || win.isDestroyed()) return;
    if (cmd.type === 'zoom') { zoom = Math.max(.5, Math.min(3, Number(cmd.value) || 1)); await applyZoom(); }
    if (['viewport','test-viewport'].includes(cmd.type) && Number.isInteger(cmd.width) && Number.isInteger(cmd.height)) {
      viewport={width:Math.max(1,Math.min(8000,cmd.width)),height:Math.max(1,Math.min(8000,cmd.height))};
      // Let Electron update its non-resizable size constraints as well as the
      // renderer. The native owner then positions this same-sized surface.
      win.setContentSize(viewport.width,viewport.height);
      await applyZoom();
    }
    if (cmd.type === 'mute') win.webContents.setAudioMuted(!!cmd.value);
    if (cmd.type === 'background') win.webContents.setBackgroundThrottling(!cmd.value);
    if (cmd.type === 'reload') win.webContents.reload();
    if (cmd.type === 'stop') win.webContents.stop();
    if (cmd.type === 'focus' && win.isVisible()) { win.focus(); win.webContents.focus(); }
    if (cmd.type === 'visibility') { if (cmd.value) win.showInactive(); else win.hide(); }
    if (cmd.type === 'clear-cache') await win.webContents.session.clearCache();
    if (cmd.type === 'clear-data') await win.webContents.session.clearStorageData();
    if (['capture','test-geometry'].includes(cmd.type) && process.env.BLITZ_HOST_TEST === '1' && typeof cmd.path === 'string') {
      const geometry=await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('DungeonBlitz'),r=e?.getBoundingClientRect();return{focused:document.hasFocus(),active:document.activeElement?.id,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,fixture:window.__fixtureResult||null,inputProbe:typeof e?.BlitzInputProbe==='function'?e.BlitzInputProbe():null,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}})()`);
      require('fs').writeFileSync(cmd.path+'.json',JSON.stringify({visible:win.isVisible(),focused:win.isFocused(),contentFocused:win.webContents.isFocused(),windows:BrowserWindow.getAllWindows().length,size:win.getContentSize(),zoom,viewport,scale:win.webContents.getZoomFactor(),clientIntegration,geometry,testEdits}));
      if(cmd.type==='capture'){const image = await win.webContents.capturePage(); require('fs').writeFileSync(cmd.path, image.toPNG()); emit({ type: 'captured', path: cmd.path });}
    }
    if (cmd.type === 'test-input' && process.env.BLITZ_HOST_TEST === '1') win.webContents.sendInputEvent(cmd.input);
    if (cmd.type === 'test-paste-source' && process.env.BLITZ_HOST_TEST === '1' && typeof cmd.text==='string') {
      // Exercise real insertion with dummy data without touching the clipboard.
      readPasteText=()=>cmd.text;
    }
    if (cmd.type === 'quit') { win.destroy(); app.quit(); }
  } catch (_) { emit({ type: 'error', message: 'Invalid game host command.' }); }
});
app.on('window-all-closed', () => app.quit());
