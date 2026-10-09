const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const modulePath=path.join(__dirname,'../runtime/game/resources/game-window.node');
test('native game input boundary rejects malformed and nonexistent window handles',{skip:!fs.existsSync(modulePath)},()=>{
 const boundary=require(modulePath);
 for(const value of [undefined,null,'window',1,Buffer.alloc(0),Buffer.alloc(4)])
  assert.throws(()=>boundary.attach(value),/Expected one native game window handle/);
 // Zero names no window. Never query or hook another application's HWND.
 assert.throws(()=>boundary.attach(Buffer.alloc(8)),/Only this game process's own window thread/);
});
