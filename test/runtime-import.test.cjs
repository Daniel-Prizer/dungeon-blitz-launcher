const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyImported}=require('../scripts/runtime-import.cjs');
test('cached imported runtime verifies the complete inventory and rejects tampering, missing files and unsafe paths',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-import-'));const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 try{
  fs.mkdirSync(path.join(dir,'resources'));fs.writeFileSync(path.join(dir,'host.exe'),'host');fs.writeFileSync(path.join(dir,'resources/plugin.dll'),'plugin');
  const files={'host.exe':hash('host'),'resources/plugin.dll':hash('plugin')};
  assert.deepEqual(verifyImported(dir,files,{'host.exe':hash('host')}),files);
  assert.throws(()=>verifyImported(dir,files,{'host.exe':hash('other')}));
  fs.writeFileSync(path.join(dir,'resources/plugin.dll'),'changed');assert.throws(()=>verifyImported(dir,files,{}));
  fs.unlinkSync(path.join(dir,'resources/plugin.dll'));assert.throws(()=>verifyImported(dir,files,{}));
  for(const name of ['../secret','/secret','resources//plugin.dll','resources/./plugin.dll','C:/secret'])assert.throws(()=>verifyImported(dir,{[name]:hash('x')},{}));
  assert.throws(()=>verifyImported(dir,null));assert.throws(()=>verifyImported(dir,[]));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
