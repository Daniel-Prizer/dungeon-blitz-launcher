'use strict';
const fs=require('fs'),path=require('path');
// Chromium supplies game-only compositor pixels. At most one capture and one
// GPU batch can be pending. Raw pixels stay in this process; no PNG, base64,
// renderer bridge, remote API, desktop capture or input forwarding is involved.
class NeuralPresentation {
 constructor(win,emit){this.win=win;this.emit=emit;this.active=false;this.visible=false;this.generation=0;this.stats={mode:'off'};this.lastFrame=0;this.samples=[];this.rate=60;this.busy=false;this.subscriptionFrame=0;}
 snapshot(){return {...this.stats,targetFPS:this.rate,native:this.native?JSON.parse(this.native.status()):null};}
 setVisible(value){this.visible=value===true;}
 async captureImage(){
  let watchdog;
  try{return await Promise.race([this.win.webContents.capturePage(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('Game capture timed out. Original rendering restored.')),2000);})]);}
  finally{clearTimeout(watchdog);}
 }
 setRate(rate){if([60,120].includes(rate))this.rate=rate;}
 schedule(generation,delay=1){
  if(!this.active||generation!==this.generation)return;
  this.timer=setTimeout(async()=>{const started=Date.now();await this.capture(generation);if(this.active&&generation===this.generation)this.schedule(generation,Math.max(1,1000/this.rate-(Date.now()-started)));},delay);
 }
 async configure(enabled){
  if(enabled===this.active)return;
  this.stop();if(!enabled)return;
  try{
   this.native=require(path.join(process.resourcesPath,'neural-window.node'));
   const passes=JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'neural/passes.json'),'utf8'));
   this.native.start(this.win.getNativeWindowHandle(),passes.map(p=>p.source));
   this.active=true;this.stats={mode:'neural',frames:0,captureMs:0,prepareMs:0,capturedFPS:0};this.lastFrame=0;this.lastAccepted=Date.now();this.subscriptionFrame=0;
   const generation=this.generation;
   this.win.webContents.beginFrameSubscription(false,image=>{if(this.active&&this.visible&&generation===this.generation)this.process(image,true);});
   // Warm start without waiting for an animation to invalidate the page.
   const started=Date.now();const image=await this.captureImage();
   if(this.active&&generation===this.generation){this.stats.captureMs=Date.now()-started;this.process(image);}
   // Electron 11's software compositor supplies empty frame-subscription
   // bitmaps on the inactive desktop. A bounded pull fallback also recovers
   // from stalled/occluded subscriptions; it never captures another window.
   this.schedule(generation);
   this.emit(this.snapshot());
  }catch(e){this.stop();this.stats={mode:'off',error:'Neural upscaling is unavailable: '+String(e.message).slice(0,160)};this.emit(this.snapshot());}
 }
 async capture(generation){
  if(!this.active||!this.visible||this.busy||generation!==this.generation||Date.now()-this.subscriptionFrame<100)return;
  this.busy=true;const started=process.hrtime();
  try{const image=await this.captureImage();if(this.active&&generation===this.generation){const t=process.hrtime(started);this.stats.captureMs=t[0]*1000+t[1]/1e6;this.process(image);}}
  catch(e){if(this.active&&generation===this.generation){this.stop();this.stats={mode:'off',error:'Game capture stopped. Original rendering restored.'};this.emit(this.snapshot());}}
  finally{if(generation===this.generation)this.busy=false;}
 }
 process(image,subscription=false){
  const now=Date.now();if(subscription&&now-this.lastFrame<1000/this.rate-2)return;
  try{
   const started=process.hrtime();const size=image.getSize();
   if(!size.width||!size.height)return;
   const factors=image.getScaleFactors(),scale=factors[0]||1;
   const actual=image.getSize(scale),pixels=image.getBitmap({scaleFactor:scale});
   if(!actual.width||!actual.height||!pixels.length)return;
   if(actual.width>3840||actual.height>2160)throw Error('Game viewport exceeds the experimental 4K limit.');
   this.stats.input={actual,bytes:pixels.length,scale,factors};
   if(subscription)this.subscriptionFrame=now;
   this.lastFrame=now;
   const accepted=this.native.frame(pixels,actual.width,actual.height);
   const elapsed=process.hrtime(started);this.stats.prepareMs=elapsed[0]*1000+elapsed[1]/1e6;
   if(accepted){this.lastAccepted=now;this.stats.frames++;this.samples.push(now);while(this.samples.length&&this.samples[0]<now-1000)this.samples.shift();this.stats.capturedFPS=this.samples.length;}
   else if(now-this.lastAccepted>2000)throw Error('Neural GPU queue stalled. Original rendering restored.');
   if(!this.published||now-this.published>=1000){this.published=now;this.emit(this.snapshot());}
  }catch(e){const input=this.stats.input;this.stop();this.stats={mode:'off',error:String(e.message).slice(0,160),input};this.emit(this.snapshot());}
 }
 stop(){
  this.generation++;clearInterval(this.timer);this.timer=null;this.busy=false;
  if(this.active&&!this.win.isDestroyed()&&!this.win.webContents.isDestroyed())this.win.webContents.endFrameSubscription();
  this.active=false;try{this.native?.end();}catch(_){}this.native=null;this.samples=[];this.stats={mode:'off'};
 }
 testReadback(file){if(process.env.BLITZ_HOST_TEST!=='1'||!this.native)return false;fs.writeFileSync(file,this.native.readback());return true;}
 async testFixture(file){
  if(process.env.BLITZ_HOST_TEST!=='1'||!this.native)return;
  const visible=this.visible;this.visible=false;
  try{
   const pixels=Buffer.alloc(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4;pixels[at]=x<32?220:25;pixels[at+1]=35;pixels[at+2]=x<32?25:220;pixels[at+3]=255;}
   const assert=require('assert');assert.throws(()=>this.native.start(Buffer.alloc(8),[]));assert.throws(()=>this.native.frame(Buffer.alloc(1),64,64));
   // Invalid calls must not destroy the valid renderer. No foreign HWND is used.
   for(let i=0;i<50&&!this.native.frame(pixels,64,64);i++)await new Promise(r=>setTimeout(r,20));
   fs.writeFileSync(file,this.native.readback());
  }finally{this.visible=visible;}
 }
}
module.exports={NeuralPresentation};
