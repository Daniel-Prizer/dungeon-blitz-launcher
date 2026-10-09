// Flash's native selection keys work, but page-level edit commands can be no-ops
// in its fields. Keep clipboard text inside the game process and deliver the same
// character events used for normal typing, preserving Flash's selected text.
function editingCommand(input) {
  if(input.type!=='keyDown' || input.alt)return null;
  const key=input.key.toLowerCase(),ctrl=input.control||input.meta;
  if(input.shift && key==='insert' && !ctrl)return 'paste';
  if(!ctrl)return null;
  if(key==='v')return 'paste';
  // Flash handles selection/copy/undo itself; leave those native keys untouched.
  return null;
}
function pasteIntoFlash(webContents,readText) {
  // Single-line game fields should not receive embedded Enter/control keys.
  const text=String(readText()||'').slice(0,32768).replace(/[\u0000-\u001f\u007f]/g,'');
  for(const character of text){
    // A cancelled Ctrl+V keydown suppresses subsequent char-only events in
    // Chromium. Start a fresh key sequence for every inserted character.
    for(const type of ['keyDown','char','keyUp'])webContents.sendInputEvent({type,keyCode:character,modifiers:[]});
  }
}
module.exports={editingCommand,pasteIntoFlash};
