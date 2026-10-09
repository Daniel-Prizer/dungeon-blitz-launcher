'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=async()=>{
 await require('./prepare-neural.cjs')();
 const root=path.resolve(__dirname,'..'),cache=path.join(root,'.test-tools');
 const target=path.join(root,'runtime/game/resources/neural-window.node');
 execFileSync(path.join(cache,'zig/zig-windows-x86_64-0.13.0/zig.exe'),['cc','-target','x86_64-windows-gnu','-shared','-O2','-s','-Wall','-Wextra','-Wno-unused-parameter','-std=c11','-I',path.join(cache,'node-api'),path.join(root,'src/NeuralWindow.c'),'-o',target,'-lcomctl32','-luser32','-lkernel32','-ld3d11','-ldxgi','-ld3dcompiler_47','-ldxguid'],{windowsHide:true,stdio:'inherit'});
 console.log('Built neural GPU presentation module.');
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
