'use strict';
const binding = require('./autorun-binding.js');
// Renderer-local binding: Ö follows the keyboard layout by default. Saved
// replacements use a physical key code. Ordinary typing/chords remain untouched.
class AutorunShortcut {
  constructor(toggle, stop) {
    this.toggle = toggle;
    this.stop = stop;
    this.enabled = true;
    this.key = 'ö';
    this.held = false;
    this.pending = false;
    this.revision = 0;
  }
  reset() {
    this.held = false;
    this.revision++;
    void Promise.resolve(this.stop()).catch(() => false);
  }
  // Losing foreground cancels an uncommitted key toggle and its held-key
  // latch, while an already activated native autorun keeps its direction.
  blur() {
    this.held = false;
    this.revision++;
  }
  configure(value, key = 'ö') {
    if (typeof value !== 'boolean' || !binding.valid(key)) return;
    if (this.enabled !== value || this.key !== key) {
      this.enabled = value;
      this.key = key;
      this.reset();
    }
  }
  input(input) {
    if (!binding.matches(input, this.key)) return;
    if (input.type === 'keyUp') {
      this.held = false;
      return;
    }
    if (input.type !== 'keyDown' || this.held || input.isAutoRepeat) return;
    this.held = true;
    if (
      !this.enabled ||
      this.pending ||
      input.control ||
      input.alt ||
      input.meta ||
      (this.key !== 'ö' && input.shift)
    )
      return;
    const revision = this.revision;
    this.pending = true;
    void Promise.resolve()
      .then(() => (this.enabled && revision === this.revision ? this.toggle() : false))
      .catch(() => false)
      .finally(() => {
        this.pending = false;
      });
  }
}
module.exports = { AutorunShortcut };
