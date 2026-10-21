'use strict';
const fs=require('fs'),path=require('path');
// Bundle only our small, static named-import module grammar. This is not a
// remote module loader or a general transpiler. Reject unfamiliar syntax rather
// than evaluating fetched code. Each module keeps its own lexical scope.
function bundle(directory,entry){const modules=new Map();function add(name){if(!/^[a-z-]+\.mjs$/.test(name))throw Error('Invalid bundled module');if(modules.has(name))return;modules.set(name,'');let source=fs.readFileSync(path.join(directory,name),'utf8');const exports=[];
 source=source.replace(/^import\s*\{([A-Za-z0-9_,\s]+)\}\s*from\s*'\.\/([a-z-]+\.mjs)';/gm,(_all,names,dependency)=>{add(dependency);return 'const {'+names+'}=__require('+JSON.stringify(dependency)+');';});
 source=source.replace(/\bexport (async )?(class|function|const) ([A-Za-z0-9_]+)/g,(_all,async,kind,name)=>{exports.push(name);return (async||'')+kind+' '+name;}).replace(/import\.meta\.url/g,JSON.stringify('https://launcher.invalid/'+name));
 if(/^\s*(import|export)\s/m.test(source))throw Error('Unsupported bundled module syntax: '+name);
 modules.set(name,'function(__require,__exports){\n'+source+'\n'+exports.map(n=>'__exports.'+n+'='+n+';').join('\n')+'\n}');}
 add(entry);return '(()=>{const modules={'+[...modules].map(([n,code])=>JSON.stringify(n)+':'+code).join(',')+'},cache={};const __require=name=>{if(cache[name])return cache[name];const result=cache[name]={};modules[name](__require,result);return result;};return __require('+JSON.stringify(entry)+');})()';}
function resources(directory){const worker=bundle(directory,'render-worker.mjs'),main=bundle(directory,'native-entry.mjs'),art=fs.readFileSync(path.join(directory,'binary.mjs'),'utf8').replace(/export function/g,'function')+'\n'+fs.readFileSync(path.join(directory,'art-worker.mjs'),'utf8').replace("import {nativeBytes} from './binary.mjs';",'');if(main.length>128*1024||worker.length>256*1024||art.length>32768)throw Error('GPU source budget exceeded');return {main,worker,art};}
module.exports={bundle,resources};
