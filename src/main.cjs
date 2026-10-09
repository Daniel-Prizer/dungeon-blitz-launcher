'use strict';
const { app, BrowserWindow, ipcMain, protocol, session, Menu, screen, powerSaveBlocker, nativeTheme, shell } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { gameURL, validSettings, AUDIO_BUSES } = require('./policy.cjs');
const { loadStore } = require('./store.cjs');
const { LegacyRuntime } = require('./legacy-runtime.cjs');
const { classifyLink } = require('./legacy/links.cjs');
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
const privateDesktop = smoke && process.argv.includes('--private-desktop');
if (privateDesktop) require('node:child_process').execFileSync(path.join(__dirname, '../.test-tools/PrivateDesktop.exe'), ['--check'], { windowsHide: true });
// Keep the existing local settings and sign-in profile through the product rename.
app.setPath('userData', smoke ? path.join(__dirname, '../.test-profile') : path.join(app.getPath('appData'), 'Blitz Browser'));
app.setName('Dungeon Blitz Launcher');
const store = loadStore(app.getPath('userData'));
if (!store.data.settings.hardwareAcceleration) app.disableHardwareAcceleration();
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'blitz', privileges: { standard: true, secure: true } }]);
const UI = 'blitz://app/index.html';
const TITLEBAR_HEIGHT=32;
let win, game, gameAddress = '', modal = null, error = '', loading = true, closing = false, blocker = null, fullscreenRevision = 0, capturingShortcut=false;
const externalLinks = []; let lastExternalLink = 0;
async function openGameLink(event) {
  const link = classifyLink(event.url, gameAddress);
  if (!link || link.type !== 'external' || event.userGesture !== true || modal || Date.now() - lastExternalLink < 1000) return;
  lastExternalLink = Date.now();
  // Tests record the exact handoff but must never open Daniel's browser.
  if (smoke) { externalLinks.push(link.url); return; }
  try { await shell.openExternal(link.url); }
  catch (_) { if(win&&!win.isDestroyed()&&!closing){error = 'The link could not open in your default browser.'; modal = 'error'; layout(); win.webContents.focus();} }
}
function state() {
  return { settings: store.data.settings, gameURL: gameAddress, loading, error, modal, fullscreen: win?.isFullScreen() || false,
    cursor: game?.cursorState || { enabled: store.data.settings.cursorLock, suspended: false, active: false },
    audio: game?.audioState || null, audioIntegration:game?.audioIntegration ?? null, clientIntegration: game?.clientIntegration ?? null, capturingShortcut, version: app.getVersion(), pendingURL: gameAddress !== store.data.settings.gameURL };
}
function publish() { if (win && !win.isDestroyed()) win.webContents.send('blitz:state', state()); }
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize(), top = win.isFullScreen() ? 0 : TITLEBAR_HEIGHT;
  game?.resize({ x: 0, y: top, width, height: Math.max(1, height - top) }, win.isVisible() && !win.isMinimized() && !modal, win.isFullScreen());
  const awake = !!game && store.data.settings.keepGameAwake;
  if (awake && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!awake && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  publish();
}
function focusGame() { if (!modal) game?.focus(); }
function openSettings() { capturingShortcut=false;modal = 'settings'; layout(); if (!smoke || privateDesktop) win.focus(); win.webContents.focus(); }
function finishFullscreen(revision, requested) {
  if (!win || win.isDestroyed() || revision !== fullscreenRevision || win.isFullScreen() !== requested || modal) return;
  layout(); focusGame();
}
function setFullscreen(value) {
  capturingShortcut=false;
  const revision = ++fullscreenRevision, requested = !!value; modal = null;
  if (!smoke || privateDesktop) win.focus();
  win.setFullScreen(requested); layout(); setImmediate(() => finishFullscreen(revision, requested));
}
function keyboard(event, input) {
  if(modal==='settings'&&capturingShortcut)return;
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase(), ctrl = input.control || input.meta;
  if (key === 'f11') setFullscreen(!win.isFullScreen());
  else if (key === 'escape' && modal) { modal = null; layout(); focusGame(); }
  else if (key === 'escape' && win.isFullScreen()) setFullscreen(false);
  else if (ctrl && key === ',') openSettings();
  else return;
  event.preventDefault();
}
function startGame() {
  capturingShortcut=false;
  game?.close(); game = null; error = ''; loading = true; gameAddress = store.data.settings.gameURL;
  try {
    const root = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, '../runtime');
    const instance = new LegacyRuntime(root, win.getNativeWindowHandle(), smoke, privateDesktop, gameAddress,store.data.settings.hardwareAcceleration); game = instance;
    const current = () => game === instance && !closing;
    instance.on('ready', () => { if (!current()) return; instance.configure(store.data.settings); layout(); if (win.isFocused()) focusGame(); });
    instance.on('failure', message => { if (!current()) return; error = String(message).slice(0, 300); loading = false; modal = 'error'; layout(); win.webContents.focus(); });
    instance.on('status', () => { if (current()) publish(); });
    instance.on('event', event => {
      if (!current()) return;
      if (event.type === 'loading') loading = !!event.value;
      if (event.type === 'zoom-applied') layout();
      if (event.type === 'error') { error = String(event.message).slice(0, 300); modal = 'error'; layout(); win.webContents.focus(); }
      if (event.type === 'fullscreen') setFullscreen(!win.isFullScreen());
      if (event.type === 'settings') openSettings();
      if (event.type === 'escape' && win.isFullScreen()) setFullscreen(false);
      if (event.type === 'close-window') win.close(); publish();
      if (event.type === 'external-link') void openGameLink(event);
    });
    instance.on('key', key => {
      if (!current()) return;
      if (key === 'settings') openSettings();
      else if (key === 'fullscreen') setFullscreen(!win.isFullScreen());
      else if (key === 'exit-fullscreen') setFullscreen(false);
    });
    layout();
  } catch (e) { error = e.message; loading = false; modal = 'error'; layout(); }
}
async function action(name, value) {
  switch (name) {
    case 'state': return state();
    case 'settings': openSettings(); break;
    case 'dismiss': capturingShortcut=false;modal = null; layout(); focusGame(); break;
    case 'capture-shortcut': capturingShortcut=modal==='settings'&&value===true;publish();break;
    case 'fullscreen': setFullscreen(!win.isFullScreen()); break;
    case 'exit-fullscreen': setFullscreen(false); break;
    case 'restart-game': modal = null; startGame(); break;
    case 'toggle-cursor': game?.toggleCursor(); break;
    case 'save-settings': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings.');
      if ('gameURL' in value && !gameURL(value.gameURL)) throw new Error('Use an HTTPS game URL, or HTTP for localhost. Passwords in URLs are not allowed.');
      if ('volume' in value && (!Number.isInteger(value.volume) || value.volume < 0 || value.volume > 100)) throw new Error('Volume must be a whole number from 0 to 100.');
      if('renderResolution' in value&&![.5,.75,1].includes(value.renderResolution))throw new Error('Choose 100%, 75% or 50% rendering resolution.');
      if('showFPS' in value&&typeof value.showFPS!=='boolean')throw new Error('Show FPS counter must be on or off.');
      if('audioMix' in value&&(!value.audioMix||Array.isArray(value.audioMix)||!AUDIO_BUSES.every(key=>Number.isInteger(value.audioMix[key])&&value.audioMix[key]>=0&&value.audioMix[key]<=100)))throw new Error('Sound volumes must be whole numbers from 0 to 100.');
      const previous = store.data.settings, next = validSettings({ ...previous, ...value }); store.data.settings = next;
      try { store.save(); } catch { store.data.settings = previous; throw new Error('Settings could not be saved. Check free disk space.'); }
      game?.configure(next); layout();
      return { ok: true, message: previous.hardwareAcceleration !== next.hardwareAcceleration ? 'Saved. Restart the launcher to change graphics acceleration.' : 'Saved' };
    }
    default: throw new Error('Unsupported launcher action.');
  }
  return { ok: true };
}
async function start() {
  nativeTheme.themeSource = 'dark';
  const ses = session.defaultSession;
  ses.protocol.handle('blitz', request => {
    const u = new URL(request.url), name = u.pathname.slice(1);
    if (u.hostname !== 'app' || !['index.html', 'ui.js', 'ui.css','shortcuts.js','icon.png','wordmark.png'].includes(name)) return new Response('Not found', { status: 404 });
    const file=name.endsWith('.png')?path.join(__dirname,'../assets',name):path.join(__dirname,name);
    return new Response(fs.readFileSync(file), { headers: {
      'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png')?'image/png':'text/html',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
  });
  ses.setPermissionRequestHandler((_wc, _p, callback) => callback(false)); ses.setPermissionCheckHandler(() => false); ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('blitz://app/') }));
  const saved = store.data.window, display = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ width: Math.max(800, Math.min(saved.width || 1280, display.width)), height: Math.max(600, Math.min(saved.height || 900, display.height)),
    minWidth: 800, minHeight: 600, show: !smoke, title: 'Dungeon Blitz Launcher', backgroundColor: '#15171c',
    icon:path.join(__dirname,'../assets/icon.ico'),titleBarStyle: 'hidden', titleBarOverlay: { color: '#191c23', symbolColor: '#cbd1db', height: TITLEBAR_HEIGHT },
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, preload: path.join(__dirname, 'preload.cjs') } });
  Menu.setApplicationMenu(null); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault()); win.webContents.on('will-attach-webview', event => event.preventDefault()); win.webContents.on('before-input-event', keyboard);
  ipcMain.handle('blitz:action', async (event, name, value) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== UI) throw new Error('Untrusted command source.');
    try { return await action(name, value); } catch (e) { return { ok: false, error: e.message }; }
  });
  await win.loadURL(UI); startGame(); if (saved.maximized && !smoke) win.maximize();
  for (const event of ['resize', 'move', 'show', 'hide', 'minimize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) win.on(event, layout);
  for (const event of ['enter-full-screen', 'leave-full-screen']) win.on(event, () => { const revision = fullscreenRevision; setImmediate(() => finishFullscreen(revision, win?.isFullScreen())); });
  win.on('close', event => {
    if (closing) return; event.preventDefault(); closing = true;
    store.data.window = { width: win.getNormalBounds().width, height: win.getNormalBounds().height, maximized: win.isMaximized() };
    try { store.save(); } catch {} game?.close(); win.destroy(); app.quit();
  });
  win.on('closed', () => { win = null; }); publish();
  if (smoke) global.__blitzTest = { state, externalLinks, nativeCommand: (_id, command) => game?.send(command), runtime: () => game,
    shutdown: () => { closing = true; game?.close(); win.destroy(); app.quit(); } };
}
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); focusGame(); } });
  app.whenReady().then(start).catch(e => { console.error('Launcher startup failed:', e.message); app.quit(); });
}
app.on('before-quit', () => game?.close()); app.on('window-all-closed', () => app.quit());
