'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NeuralPresentation}=require('../src/legacy/neural.cjs');
test('neural capture has backpressure and ignores a late result after stop',async()=>{
 let finish,captures=0,frames=0;const win={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,endFrameSubscription(){},capturePage(){captures++;return new Promise(resolve=>finish=resolve);}}};
 const p=new NeuralPresentation(win,()=>{});p.active=p.visible=true;p.native={end(){}};p.process=()=>frames++;
 const first=p.capture(p.generation);await p.capture(p.generation);assert.equal(captures,1);p.stop();finish({});await first;assert.equal(frames,0);assert.equal(p.stats.mode,'off');
});
test('a stalled capture restores original rendering without a popup',async()=>{
 let ended=false,reported;const p=new NeuralPresentation({isDestroyed:()=>false,webContents:{isDestroyed:()=>false,endFrameSubscription(){},capturePage:()=>new Promise(()=>{})}},status=>reported=status);
 p.active=p.visible=true;p.native={end(){ended=true;}};await p.capture(p.generation);assert(ended);assert.equal(reported.mode,'off');assert.match(reported.error,/Original rendering restored/);
});
test('presentation rates do not invoke game JavaScript or modify its clock',()=>{
 const p=new NeuralPresentation({},()=>{});p.setRate(120);assert.equal(p.rate,120);p.setRate(1000);assert.equal(p.rate,120);p.setRate(60);assert.equal(p.rate,60);
});
