// Shared single-key bindings for the local UI and main-process validation.
(function (root) {
  const codes = {
    AltLeft: 0xa4,
    AltRight: 0xa5,
    ControlLeft: 0xa2,
    ControlRight: 0xa3,
    ShiftLeft: 0xa0,
    ShiftRight: 0xa1,
    Space: 0x20,
    Tab: 9,
    Enter: 13,
    Backspace: 8,
    Insert: 0x2d,
    Delete: 0x2e,
    Home: 0x24,
    End: 0x23,
    PageUp: 0x21,
    PageDown: 0x22,
    ArrowLeft: 0x25,
    ArrowUp: 0x26,
    ArrowRight: 0x27,
    ArrowDown: 0x28,
    CapsLock: 0x14,
    Semicolon: 0xba,
    Equal: 0xbb,
    Comma: 0xbc,
    Minus: 0xbd,
    Period: 0xbe,
    Slash: 0xbf,
    Backquote: 0xc0,
    BracketLeft: 0xdb,
    Backslash: 0xdc,
    BracketRight: 0xdd,
    Quote: 0xde,
    NumpadMultiply: 0x6a,
    NumpadAdd: 0x6b,
    NumpadSubtract: 0x6d,
    NumpadDecimal: 0x6e,
    NumpadDivide: 0x6f,
  };
  for (let i = 0; i < 26; i++) codes['Key' + String.fromCharCode(65 + i)] = 65 + i;
  for (let i = 0; i < 10; i++) {
    codes['Digit' + i] = 48 + i;
    codes['Numpad' + i] = 96 + i;
  }
  for (let i = 1; i <= 24; i++) if (i !== 11) codes['F' + i] = 111 + i;
  const labels = {
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    Space: 'Space',
    CapsLock: 'Caps Lock',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
  };
  function label(code) {
    return (
      labels[code] ||
      code
        .replace(/^Key|^Digit/, '')
        .replace(/^Numpad/, 'Numpad ')
        .replace(/^Arrow/, 'Arrow ')
    );
  }
  const api = Object.freeze({ codes: Object.freeze(codes), label });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.blitzShortcuts = api;
})(typeof window === 'object' ? window : globalThis);
