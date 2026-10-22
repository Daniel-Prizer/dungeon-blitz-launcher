'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { LegacyRuntime } = require('./legacy-runtime.cjs');
const { prepare } = require('./native-player-resources.cjs');

class NativePlayerRuntime extends LegacyRuntime {
  static async prepare(root, address, profile, signal) {
    if (!fs.existsSync(path.join(root, 'native-player/BlitzNativePlayer.exe')))
      throw Error('The 120 FPS runtime is missing. Original rendering is active.');
    const resources = await prepare(root, address, signal, path.join(profile, 'public-assets'));
    return { ...resources, profile };
  }
  constructor(root, parent, test, desktop, address, acceleration, prepared) {
    super(root, parent, test, desktop, address, acceleration, {
      nativePlayer: prepared,
      onExit: () => prepared.close(),
    });
    this.nativePlayer = true;
    this.resources = prepared;
    this.nativeStatus = { phase: 'loading', cap: 120 };
    this.on('event', (event) => {
      if (event.type === 'native-status') {
        this.nativeStatus = event.value;
        this.emit('status');
      }
    });
  }
  configure(settings) {
    super.configure({
      ...settings,
      renderResolution: 1,
    });
  }
  close() {
    super.close();
    this.resources.close();
  }
}
module.exports = { NativePlayerRuntime };
