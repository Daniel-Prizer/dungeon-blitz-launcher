'use strict';
// Renderer-local text key, so Ö follows the active keyboard layout rather than
// assuming a US physical key. Ordinary typing/chords remain untouched.
class AutorunShortcut {
 constructor(toggle,stop){this.toggle=toggle;this.stop=stop;this.enabled=true;this.held=false;this.pending=false;this.revision=0;}
 reset(){this.held=false;this.revision++;void Promise.resolve(this.stop()).catch(()=>false);}
 configure(value){if(this.enabled!==value){this.enabled=value;this.reset();}}
 input(input){
  if(typeof input.key!=='string'||input.key.toLowerCase()!=='ö')return;
  if(input.type==='keyUp'){this.held=false;return;}
  if(input.type!=='keyDown'||this.held||input.isAutoRepeat)return;
  this.held=true;
  if(!this.enabled||this.pending||input.control||input.alt||input.meta)return;
  const revision=this.revision;this.pending=true;
  void Promise.resolve().then(()=>this.enabled&&revision===this.revision?this.toggle():false).catch(()=>false).finally(()=>{this.pending=false;});
 }
}
module.exports={AutorunShortcut};
