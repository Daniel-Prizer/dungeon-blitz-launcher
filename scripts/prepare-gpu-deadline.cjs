// Deliberately writes only ignored research output; never a launcher bundle.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'.test-tools'),out=path.join(cache,'gpu-renderer');
module.exports=function prepare(pulse=false){
 if(process.platform!=='win32')throw Error('Private high-resolution timer requires Windows');
 const compiler=path.join(cache,'zig/zig-windows-x86_64-0.13.0/zig.exe'),headers=path.join(cache,'node-api');
 if(!fs.existsSync(compiler)||!fs.existsSync(path.join(headers,'node_api.h')))throw Error('Prepare the existing native compiler/Node headers first');
 fs.mkdirSync(out,{recursive:true});const source=path.join(root,pulse?'research/gpu/native-pulse.c':'research/gpu/native-deadline.c'),identity=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,16),target=path.join(out,(pulse?'pulse-':'deadline-')+identity+'.node');if(fs.existsSync(target))return target;
 execFileSync(compiler,['cc','-target','x86_64-windows-gnu','-shared','-O2','-s','-Wall','-Wextra','-Wno-unused-parameter','-std=c11','-I',headers,path.join(root,pulse?'research/gpu/native-pulse.c':'research/gpu/native-deadline.c'),'-o',target,'-lkernel32'],{windowsHide:true,stdio:'inherit',timeout:60000});return target;
};
if(require.main===module)console.log(module.exports());
