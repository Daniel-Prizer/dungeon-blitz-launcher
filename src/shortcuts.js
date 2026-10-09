// Shared single-key bindings for the local UI and main-process validation.
(function(root){
 const codes={AltLeft:0xA4,AltRight:0xA5,ControlLeft:0xA2,ControlRight:0xA3,ShiftLeft:0xA0,ShiftRight:0xA1,
  Space:0x20,Tab:9,Enter:13,Backspace:8,Insert:0x2D,Delete:0x2E,Home:0x24,End:0x23,PageUp:0x21,PageDown:0x22,
  ArrowLeft:0x25,ArrowUp:0x26,ArrowRight:0x27,ArrowDown:0x28,CapsLock:0x14,
  Semicolon:0xBA,Equal:0xBB,Comma:0xBC,Minus:0xBD,Period:0xBE,Slash:0xBF,Backquote:0xC0,BracketLeft:0xDB,Backslash:0xDC,BracketRight:0xDD,Quote:0xDE,
  NumpadMultiply:0x6A,NumpadAdd:0x6B,NumpadSubtract:0x6D,NumpadDecimal:0x6E,NumpadDivide:0x6F};
 for(let i=0;i<26;i++)codes['Key'+String.fromCharCode(65+i)]=65+i;
 for(let i=0;i<10;i++){codes['Digit'+i]=48+i;codes['Numpad'+i]=96+i;}
 for(let i=1;i<=24;i++)if(i!==11)codes['F'+i]=111+i;
 const labels={AltLeft:'Left Alt',AltRight:'Right Alt',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',Space:'Space',CapsLock:'Caps Lock',PageUp:'Page Up',PageDown:'Page Down'};
 function label(code){return labels[code]||code.replace(/^Key|^Digit/,'').replace(/^Numpad/,'Numpad ').replace(/^Arrow/,'Arrow ');}
 const api=Object.freeze({codes:Object.freeze(codes),label});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.blitzShortcuts=api;
})(typeof window==='object'?window:globalThis);
