'use strict';
const { LegacyRuntime } = require('./legacy-runtime.cjs');
const { originalAddress } = require('./game-source.cjs');
// Keep the proven native game/HUD/input runtime. Only the retained world moves
// to a GPU worker; selecting GPU no longer migrates the game itself to Ruffle.
class NativeGpuRuntime extends LegacyRuntime {
  constructor(root, parent, test, desktop, address, acceleration = true, options = {}) {
    const selected = originalAddress(address);
    if (!selected)
      throw Error(
        'GPU currently supports the official multiplayer game. Choose Original for local servers.'
      );
    super(root, parent, test, desktop, selected, acceleration, { ...options, nativeGpu: true });
    this.on('event', (event) => {
      if (event.type === 'gpu-status') {
        this.gpuStatus = event.status;
        this.emit('status');
      }
    });
  }
}
module.exports = { NativeGpuRuntime };
