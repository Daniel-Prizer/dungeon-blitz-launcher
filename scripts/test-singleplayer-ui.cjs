'use strict';
// The real shell + real Electron utility process. The game surface is a
// non-rendering fixture so no branded game/production profile is launched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright'),root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(root,'artifacts/singleplayer-ui-')),entry=path.join(out,'entry.cjs');
fs.writeFileSync(entry,`const {app}=require('electron'),path=require('path'),{EventEmitter}=require('events');
const base=${JSON.stringify(root)},profile=${JSON.stringify(path.join(out,'profile'))};const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?profile:value);
class Surface extends EventEmitter{constructor(...args){super();this.address=args[4];this.options=args[6];global.surface=this;setImmediate(()=>{this.emit('ready');this.emit('event',{type:'loading',value:false});});}configure(){}resize(){}focus(){}close(){}send(){}}
for(const [name,value]of [['legacy-runtime.cjs',{LegacyRuntime:Surface}],['modern-runtime.cjs',{ModernRuntime:Surface,modernAddress:value=>value.startsWith('https://dungeonblitzr.theminesa.studio/')}]])require.cache[require.resolve(path.join(base,'src',name))]={exports:value};
require(path.join(base,'src/main.cjs'));`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let app;try{
 fs.mkdirSync(path.join(out,'profile'),{recursive:true});fs.writeFileSync(path.join(out,'profile/preferences.json'),JSON.stringify({settings:require('../src/policy.cjs').validSettings({autoUpdates:false,gameRenderer:'gpu'})}));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({args:[entry,'--smoke-test'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
 const call=(name,value)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[name,value]);
 await call('settings');await page.getByRole('tab',{name:'Connection',exact:true}).click();
 const initial=await call('state');assert.equal(initial.settings.ownedSingleplayer,false);
 await page.getByRole('button',{name:'Use singleplayer',exact:true}).click();assert.equal((await call('state')).singleplayer.phase,'stopped');assert.equal((await call('state')).settings.ownedSingleplayer,false);
 await page.locator('#discard').click();assert.equal((await call('state')).settings.ownedSingleplayer,false);
 await page.getByRole('button',{name:'Use singleplayer',exact:true}).click();await page.locator('#save-settings').click();
 assert.equal((await call('state')).settings.ownedSingleplayer,true);assert.equal((await call('state')).singleplayer.phase,'stopped');assert.equal((await call('state')).settings.gameRenderer,'gpu');
 await call('restart-game');
 for(let i=0;i<150;i++){const s=await call('state');if(s.singleplayer.phase==='running'&&!s.loading)break;if(s.error)throw Error(s.error);await wait(100);}
 const running=await call('state');assert.equal(running.singleplayer.phase,'running');assert.equal(running.pendingURL,false);assert.notEqual(running.gameURL,'http://localhost:8000/');
 assert(await app.evaluate(()=>!!global.surface.options.singleplayerPorts));
 await call('settings');await page.getByRole('tab',{name:'Display',exact:true}).click();await page.screenshot({path:path.join(out,'singleplayer-renderer.png')});assert.match(await page.locator('#gpu-status').innerText(),/preference is kept/);
 await call('restart-game');await wait(500);assert.equal((await call('state')).gameURL,running.gameURL,'reconnect reuses its owned world');
 await call('settings');await page.getByRole('tab',{name:'Connection',exact:true}).click();await page.getByRole('button',{name:'Use multiplayer',exact:true}).click();await page.locator('#save-settings').click();assert.equal((await call('state')).singleplayer.phase,'running','Save never changes the running connection');
 await call('restart-game');for(let i=0;i<80&&(await call('state')).singleplayer.phase!=='stopped';i++)await wait(100);
 assert.equal((await call('state')).singleplayer.phase,'stopped');assert.equal((await call('state')).settings.gameRenderer,'gpu');
 await app.evaluate(()=>global.__blitzTest.shutdown());app=null;console.log('PASS real shell draft/save/reconnect, utility startup/shutdown, original fallback and preserved GPU preference: '+out);
 }finally{if(app){await app.evaluate(()=>global.__blitzTest?.shutdown()).catch(()=>{});await app.close();}}})().catch(e=>{console.error(e);process.exitCode=1;});
