const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { UNLOCK_KEYS, validSettings } = require('./policy.cjs');
class LegacyRuntime extends EventEmitter {
  constructor(root, parentHandle, test = false, privateDesktop = false, gameURL) {
    super();
    this.closed = false; this.bounds = null; this.host = null; this.pending = []; this.zoom = 1; this.test = test; this.privateDesktop = privateDesktop;
    this.audioIntegration=false;
    this.layoutRevision=0;this.appliedLayoutRevision=0;this.focusPending=false;this.activationRechecks=0;
    const executable = path.join(root, 'game/BlitzGame.exe');
    const log = message => { try { const file=path.join(root,'host-diagnostics.log'); if(fs.existsSync(file)&&fs.statSync(file).size>65536)fs.writeFileSync(file,'');fs.appendFileSync(file,`${new Date().toISOString()} ${message}\n`); } catch {} };
    log('Starting native game host');
    if (!fs.existsSync(executable)) throw new Error('Game runtime missing. Run npm run prepare:game from the source folder.');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    if (test) env.BLITZ_HOST_TEST = '1'; else delete env.BLITZ_HOST_TEST;
    env.BLITZ_HOST_CHANNEL = `\\\\.\\pipe\\blitz-game-${randomBytes(24).toString('hex')}`;
    env.BLITZ_HOST_TOKEN = randomBytes(32).toString('hex');
    env.BLITZ_GAME_URL = gameURL;
    if (test) env.BLITZ_CURSOR_DRY_RUN = '1'; else delete env.BLITZ_CURSOR_DRY_RUN;
    this.server = net.createServer(socket => {
      let authenticated = false;
      socket.setTimeout(5000, () => { if (!authenticated) socket.destroy(); });
      socket.on('error', () => {});
      readline.createInterface({ input: socket }).on('line', line => {
      if (line.length > 32768) { socket.destroy(); return; }
      let event; try { event = JSON.parse(line); } catch { socket.destroy(); return; }
      if (!authenticated) {
        if (event.type !== 'auth' || event.token !== env.BLITZ_HOST_TOKEN || this.pipe) { socket.destroy(); return; }
        authenticated = true; socket.setTimeout(0); this.pipe = socket;
        log('Game command pipe authenticated');
        for (const command of this.pending) socket.write(command); this.pending = [];
        return;
      }
      if (event.type === 'ready') {
        log(`Game runtime ready: Electron ${event.electron}, Chromium ${event.chromium}`);
        if (!/^\d+$/.test(event.hwnd)) return;
        // Hidden tests never create, raise, focus or reparent desktop windows.
        if (this.test && !this.privateDesktop) { if (this.bounds) this.resize(...this.bounds); this.emit('ready', event); return; }
        const handle = parentHandle.length === 8 ? parentHandle.readBigUInt64LE().toString() : String(parentHandle.readUInt32LE());
        this.host = spawn(path.join(root, 'NativeHost.exe'), [handle, event.hwnd], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
        this.host.stdin.on('error', () => {}); this.host.stderr.on('data', () => {});
        this.host.on('error', error => this.emit('failure', error.message));
        this.host.on('exit', code => { if (!this.closed && code) this.emit('failure', 'The game window could not be attached.'); });
        readline.createInterface({ input: this.host.stdout }).on('line', message => {
          if(message.startsWith('WINDOWTEST ')) {
            try {this.windowTest=JSON.parse(message.slice(11));}catch{}
          }
          if(message.startsWith('CURSOR ')) {
            const [,enabled,suspended,active,dryRun]=message.split(' ');
            this.cursorState={enabled:enabled==='1',suspended:suspended==='1',active:active==='1',dryRun:dryRun==='1'};
            this.emit('status');
          }
          if(message.startsWith('AUDIO ')) {
            try { this.audioState=JSON.parse(message.slice(6));this.emit('status'); } catch {}
          }
          if(message.startsWith('PLACED ')){
            this.appliedLayoutRevision=Number(message.slice(7));this.flushFocus();
          }
          if (message.startsWith('FULLSCREEN ')) {
            const [,value,result,hwnd,initResult,shellAvailable,nonRude]=message.split(' ');
            this.shellFullscreen={requested:value==='1',result:Number(result),hwnd,initResult:Number(initResult),shellAvailable:shellAvailable==='1',nonRude:nonRude==='1'};
            log(`Game Shell fullscreen ${value}, result ${result}`);
          }
          if (message === 'READY') { log('Native window attached'); if (this.bounds) { this.viewportWidth=undefined;this.viewportHeight=undefined;this.resize(...this.bounds); this.send({type:'visibility',value:this.bounds[1]}); } if(this.settings)this.configure(this.settings);this.emit('ready', event); }
          if (message.startsWith('KEY ')) this.emit('key', message.slice(4));
          if (message.startsWith('ERROR ')) { log(message); this.emit('failure', message.slice(6)); }
        });
      } else {
        if(event.type==='client-integration')this.clientIntegration=event.value===true;
        if(event.type==='audio-integration')this.audioIntegration=event.value===true;
        if(event.type==='neural-status'){this.presentation=event.value;this.emit('status');}
        if(event.type==='focused' && this.bounds?.[1] && this.bounds?.[2] && this.host?.stdin.writable){
          this.activationRechecks++;this.host.stdin.write('ACTIVATE\n');
        }
        this.emit('event', event);
      }
      });
    });
    this.server.on('error', error => this.emit('failure', error.message));
    this.server.listen(env.BLITZ_HOST_CHANNEL, () => {
      if (this.closed) { this.server.close(); return; }
      this.child = spawn(executable, [], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env });
      this.child.stderr.on('data', data => { if (test) { log(data.toString().slice(0,1500)); console.error('[game-host]',data.toString().slice(0,1500)); } });
      this.child.on('error', error => this.emit('failure', error.message));
      this.child.on('exit', code => { log(`Game process exited: ${code}`); if (test) console.error('[game-host] exited', code); if (!this.closed) this.emit('failure', 'The game runtime exited. Reconnect to try again.'); this.host?.stdin.end(); this.pipe?.destroy(); this.server.close(); });
    });
  }
  configure(settings) {
    const previous=this.settings;this.settings=validSettings(settings);
    if(!previous || previous.gameZoom!==this.settings.gameZoom)this.send({type:'zoom',value:this.settings.gameZoom});
    if(!previous || previous.keepGameAwake!==this.settings.keepGameAwake)this.send({type:'background',value:this.settings.keepGameAwake});
    if(!previous||JSON.stringify(previous.audioMix)!==JSON.stringify(this.settings.audioMix))this.send({type:'audio-mix',value:this.settings.audioMix});
    if(!previous||previous.upscaler!==this.settings.upscaler||previous.presentationFPS!==this.settings.presentationFPS)this.send({type:'neural',value:this.settings.upscaler==='neural',rate:this.settings.presentationFPS});
    if(this.host?.stdin.writable) {
      if(!previous || previous.volume!==this.settings.volume || !this.configuredHost){this.host.stdin.write(`VOLUME ${this.settings.volume}\n`);}
      if(!previous || previous.cursorLock!==this.settings.cursorLock || previous.unlockKey!==this.settings.unlockKey || !this.configuredHost)
        this.host.stdin.write(`CURSOR ${this.settings.cursorLock?1:0} ${UNLOCK_KEYS[this.settings.unlockKey]}\n`);
      this.configuredHost=true;
    }
  }
  toggleCursor() { if(this.host?.stdin.writable)this.host.stdin.write('TOGGLECURSOR\n'); }
  testHost(command) { if(this.test && this.privateDesktop && this.host?.stdin.writable)this.host.stdin.write(command+'\n'); }
  send(command) {
    if (this.closed) return;
    if (this.test && !this.privateDesktop && ['visibility', 'focus', 'capture-window'].includes(command.type)) return;
    if (command.type === 'zoom') this.zoom = Math.max(.5, Math.min(3, Number(command.value) || 1));
    const message = JSON.stringify(command) + '\n'; if (this.pipe?.writable) this.pipe.write(message); else if (this.pending.length < 50) this.pending.push(message);
  }
  resize(bounds, visible, fullscreen) {
    this.bounds = [bounds, visible, fullscreen];
    if(!visible)this.focusPending=false;
    if (this.test && !this.privateDesktop) { this.send({type:'test-viewport',width:bounds.width,height:bounds.height}); return; }
    if (this.viewportWidth!==bounds.width || this.viewportHeight!==bounds.height) {
      this.viewportWidth=bounds.width;this.viewportHeight=bounds.height;
      this.send({type:'viewport',width:bounds.width,height:bounds.height});
    }
    if (this.visible !== visible) { this.visible = visible; this.send({ type: 'visibility', value: visible }); }
    if (this.host?.stdin.writable) this.host.stdin.write(`BOUNDS ${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height} ${visible ? 1 : 0} ${fullscreen ? 1 : 0} 1 ${++this.layoutRevision}\n`);
  }
  focus() { this.focusPending=true;this.flushFocus(); }
  flushFocus() {
    if(this.closed || !this.focusPending || !this.bounds?.[1])return;
    if(!this.host || this.appliedLayoutRevision!==this.layoutRevision)return;
    this.focusPending=false;
    this.lastFocusPlacement={revision:this.appliedLayoutRevision,fullscreen:this.bounds[2],shellFullscreen:this.shellFullscreen?.requested};
    this.send({type:'focus'});
  }
  close() {
    if (this.closed) return;
    this.send({ type: 'quit' }); this.closed = true;
    if (this.host?.stdin.writable) this.host.stdin.write('QUIT\n');
    const child = this.child, host = this.host;
    this.server.close();
    const timer = setTimeout(() => { this.pipe?.destroy(); if (child && child.exitCode === null) child.kill(); if (host && host.exitCode === null) host.kill(); }, 2500); timer.unref();
  }
}
module.exports = { LegacyRuntime };
