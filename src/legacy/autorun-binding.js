// Shared UI/host policy for a renderer-local autorun binding.
(function (root) {
  const named = new Set([
    'Space',
    'Tab',
    'Enter',
    'Backspace',
    'Insert',
    'Delete',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'CapsLock',
    'Semicolon',
    'Equal',
    'Comma',
    'Minus',
    'Period',
    'Slash',
    'Backquote',
    'BracketLeft',
    'Backslash',
    'BracketRight',
    'Quote',
    'NumpadMultiply',
    'NumpadAdd',
    'NumpadSubtract',
    'NumpadDecimal',
    'NumpadDivide',
  ]);
  function valid(value) {
    return (
      value === 'ö' ||
      (typeof value === 'string' &&
        (/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F([1-9]|10|1[2-9]|2[0-4]))$/.test(value) ||
          named.has(value)))
    );
  }
  function capture(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
    if (event.key?.toLowerCase() === 'ö') return 'ö';
    return valid(event.code) ? event.code : null;
  }
  function matches(input, key) {
    return key === 'ö'
      ? typeof input.key === 'string' && input.key.toLowerCase() === 'ö'
      : input.code === key;
  }
  const api = Object.freeze({ valid, capture, matches });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.blitzAutorunBinding = api;
})(typeof window === 'object' ? window : globalThis);
