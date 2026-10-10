'use strict';
// Local game renderer input only. Keep Shift's ordinary down/up events intact;
// the reviewed Flash helper handles typing, context and current binding checks.
class MountShortcut {
  constructor(invoke){this.invoke=invoke;this.enabled=false;this.held=false;this.pending=false;this.revision=0;}
  reset(){this.held=false;this.revision++;}
  configure(value){if(this.enabled!==value){this.enabled=value;this.reset();}}
  input(input){
    if(input.code!=='ShiftLeft')return;
    if(input.type==='keyUp'){this.held=false;return;}
    if(input.type!=='keyDown'||input.isAutoRepeat||this.held)return;
    this.held=true;
    if(!this.enabled||this.pending||input.control||input.alt||input.meta)return;
    const revision=this.revision;this.pending=true;
    // One outstanding request prevents lag from queuing a burst of mounts.
    void Promise.resolve().then(()=>this.enabled&&revision===this.revision?this.invoke():false)
      .catch(()=>false).finally(()=>{this.pending=false;});
  }
}
module.exports={MountShortcut};
