const test=require('node:test'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
test('native cursor checkbox policy handles focus, repeat, saved acknowledgements and shortcut chords',()=>{
  const root=path.resolve(__dirname,'..'),exe=path.join(root,'.test-tools/CursorTests.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});
  execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe',`/out:${exe}`,path.join(root,'src/CursorLock.cs'),path.join(__dirname,'CursorTests.cs')],{windowsHide:true});
  execFileSync(exe,[],{windowsHide:true,stdio:'inherit'});
});
