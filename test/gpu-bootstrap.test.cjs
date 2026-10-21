'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('official page load keeps parameters while every fresh Ruffle facade gets transparent mode',()=>{
 const calls=[];class Node{appendChild(child){return child;}}
 const context={Node,window:{},addEventListener(){}};context.window.top=context.window;vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/gpu/bootstrap.js'),'utf8'),context);
 const child={localName:'ruffle-player',ruffle(){return {load(options){calls.push(options);return 'native-load';},callExternalInterface(){return 'native-callback';}};}};
 const parent=new Node();parent.id='game-container';assert.equal(parent.appendChild(child),child);const options={url:'/p/cbp/DungeonBlitz.swf?fv=cbp',parameters:'oauth=opaque-test',allowScriptAccess:true,wmode:'direct',backgroundColor:'#484955'};
 assert.equal(child.ruffle().load(options),'native-load');assert.equal(child.ruffle().load(options),'native-load');assert.equal(child.ruffle().callExternalInterface(),'native-callback');assert.equal(options.wmode,'direct');
 for(const value of calls){assert.equal(value.url,options.url);assert.equal(value.parameters,options.parameters);assert.equal(value.allowScriptAccess,true);assert.equal(value.backgroundColor,options.backgroundColor);assert.equal(value.wmode,'transparent');assert.equal(value.backgroundExecutionMode,'mainThread');}
 const other={localName:'ruffle-player',ruffle:()=>({load:o=>o})},factory=other.ruffle;const foreign=new Node();foreign.id='another-container';foreign.appendChild(other);assert.equal(other.ruffle,factory);
});
