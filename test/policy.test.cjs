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
  assert.deepEqual(Object.keys(validSettings({homepage:'https://example.com',runtime:'ruffle',confirmGameClose:true})),['gameURL','volume','cursorLock','unlockKey','gameZoom','keepGameAwake','hardwareAcceleration']);
});
test('migration and atomic persistence retain game preferences without browser data', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-launcher-'));
  try {
    fs.writeFileSync(path.join(dir,'preferences.json'),JSON.stringify({settings:{homepage:'https://example.com',defaultZoom:1.5},tabs:[LIVE],history:[{url:LIVE}],bookmarks:[{url:LIVE}]}));
    const old=loadStore(dir);assert.equal(old.data.settings.gameURL,LIVE);assert.equal(old.data.settings.gameZoom,1.5);assert(!('tabs'in old.data));assert(!('history'in old.data));
    old.data.settings.volume=37;old.data.settings.cursorLock=true;old.data.settings.unlockKey='F8';old.data.settings.gameURL='http://localhost:8080/';old.save();
    assert.deepEqual(loadStore(dir).data.settings,old.data.settings);
    assert(!fs.readFileSync(path.join(dir,'preferences.json'),'utf8').includes('history'));
    fs.writeFileSync(path.join(dir,'preferences.json'),'{broken');assert.equal(loadStore(dir).data.settings.volume,100);
  }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
