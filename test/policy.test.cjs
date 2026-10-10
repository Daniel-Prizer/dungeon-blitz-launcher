const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { gameURL, validSettings, LIVE } = require('../src/policy.cjs');
const { loadStore } = require('../src/store.cjs');
test('game address validates schemes, credentials and origin boundaries', () => {
  for (const url of ['javascript:x','file:///C:/secret','data:text/html,x','ftp://game/','https://user:password@example.com/','http://example.com/','http://localhost.evil.org/']) assert.equal(gameURL(url),null,url);
  for (const url of [LIVE,'https://example.com/play?server=1','http://localhost:8080/','http://127.0.0.1:8080/','http://[::1]:8080/']) assert.equal(gameURL(url),url);
  assert.equal(gameURL(LIVE+'#a'),LIVE);
});
test('launcher defaults and validation discard obsolete browser settings', () => {
  const defaults=validSettings();assert.equal(defaults.volume,100);assert.equal(defaults.cursorLock,false);assert.equal(defaults.unlockKey,'AltLeft');assert.equal(defaults.gameURL,LIVE);
  for (const value of [-1,101,Infinity,0.5,'50',null])assert.equal(validSettings({volume:value}).volume,100);
  for (let i=0;i<=100;i++)assert.equal(validSettings({volume:i}).volume,i);
  assert.equal(validSettings({unlockKey:'F11'}).unlockKey,'AltLeft');assert.equal(validSettings({unlockKey:'F8'}).unlockKey,'F8');
  assert.equal(validSettings({unlockKey:'KeyG'}).unlockKey,'KeyG');assert.equal(validSettings({unlockKey:'ControlLeft'}).unlockKey,'ControlLeft');assert.equal(validSettings({unlockKey:'Escape'}).unlockKey,'AltLeft');
  assert.deepEqual(Object.keys(validSettings({homepage:'https://example.com',runtime:'ruffle',confirmGameClose:true,upscaler:'neural',neuralCompare:true})),['gameURL','volume','audioMix','cursorLock','unlockKey','gameZoom','renderResolution','showFPS','experimentalWidescreen','autoUpdates','keepGameAwake','hardwareAcceleration']);
  assert.equal(defaults.showFPS,false);
  assert.equal(defaults.experimentalWidescreen,false);
  assert.equal(validSettings({experimentalWidescreen:true}).experimentalWidescreen,true);
  for(const value of [false,1,'true',null,{},[]])assert.equal(validSettings({experimentalWidescreen:value}).experimentalWidescreen,false);
  assert.equal(validSettings({showFPS:true}).showFPS,true);
  for(const value of [false,1,'true',null,{},[]])assert.equal(validSettings({showFPS:value}).showFPS,false);
  assert.equal(defaults.renderResolution,1);
  for(const value of [.5,.75,1])assert.equal(validSettings({renderResolution:value}).renderResolution,value);
  for(const value of [0,.6,2,NaN,'0.75',null])assert.equal(validSettings({renderResolution:value}).renderResolution,1);
  assert(!('presentationFPS' in validSettings({presentationFPS:120})), 'Obsolete FPS preference must be discarded');
  assert.deepEqual(defaults.audioMix,{player:100,music:100,environment:100,creatures:100});
  for(let i=0;i<=100;i++)assert.equal(validSettings({audioMix:{creatures:i}}).audioMix.creatures,i);
  assert.deepEqual(validSettings({audioMix:{player:-1,music:101,environment:0.5,creatures:'50'}}).audioMix,defaults.audioMix);
});
test('migration and atomic persistence retain game preferences without browser data', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-launcher-'));
  try {
    fs.writeFileSync(path.join(dir,'preferences.json'),JSON.stringify({settings:{homepage:'https://example.com',defaultZoom:1.5,upscaler:'neural',neuralCompare:true,presentationFPS:120},tabs:[LIVE],history:[{url:LIVE}],bookmarks:[{url:LIVE}]}));
    const old=loadStore(dir);assert.equal(old.data.settings.gameURL,LIVE);assert.equal(old.data.settings.gameZoom,1.5);assert.equal(old.data.settings.showFPS,false);assert(!('tabs'in old.data));assert(!('history'in old.data));
    for(const field of ['upscaler','neuralCompare','presentationFPS'])assert(!(field in old.data.settings),'Retired graphics preference must not survive migration: '+field);
    old.data.settings.volume=37;old.data.settings.cursorLock=true;old.data.settings.unlockKey='F8';old.data.settings.gameURL='http://localhost:8080/';old.save();
    old.data.settings.audioMix={player:23,music:0,environment:44,creatures:100};old.save();
    old.data.settings.renderResolution=.75;old.save();
    old.data.settings.showFPS=true;old.data.settings.experimentalWidescreen=true;old.save();assert.equal(loadStore(dir).data.settings.showFPS,true);assert.equal(loadStore(dir).data.settings.experimentalWidescreen,true);
    old.data.settings.showFPS=false;old.save();assert.equal(loadStore(dir).data.settings.showFPS,false);
    assert.deepEqual(loadStore(dir).data.settings,old.data.settings);
    assert(!fs.readFileSync(path.join(dir,'preferences.json'),'utf8').includes('history'));
    fs.writeFileSync(path.join(dir,'preferences.json'),'{broken');assert.equal(loadStore(dir).data.settings.volume,100);
  }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
