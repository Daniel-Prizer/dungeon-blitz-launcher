'use strict';
const { app, BrowserWindow, nativeImage } = require('electron'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  report = process.env.BLITZ_CURSOR_REPORT,
  records = [];
execFileSync(path.join(root, '.test-tools/PrivateDesktop.exe'), ['--check'], { windowsHide: true });
app.setPath('userData', fs.mkdtempSync(path.join(root, '.test-tools/cursor-native-')));
app.enableSandbox();
app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await window.loadURL('data:text/plain,Owned cursor bitmap fixture');
    window.showInactive();
    const native = require(path.join(root, 'runtime/game/resources/game-window.node'));
    native.attach(window.getNativeWindowHandle());
    for (const [type, name] of ['arrow', 'hand', 'crosshair'].entries()) {
      const original = native.originalPixels(type),
        width = original.readUInt32LE(0),
        hx = original.readUInt32LE(8),
        hy = original.readUInt32LE(12),
        source = original.subarray(16);
      assert.equal(source.length, width * width * 4);
      assert(hx < width && hy < width);
      const rgba = Buffer.from(require('../src/crosshair.js').recolor(source, '#ff33aa'));
      let alpha = 0,
        color = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        assert.equal(rgba[i + 3], source[i + 3]);
        alpha += rgba[i + 3] > 0;
        color += rgba[i] > rgba[i + 1] && rgba[i + 3] > 0;
      }
      assert(
        alpha > 5 && color > 5,
        'Original ' + name + ' including monochrome inversion pixels must remain visible'
      );
      native.crosshair(rgba, width, hx, hy);
      native.cursorType(true);
      const pixels = native.cursorPixels(),
        expected = Buffer.from(rgba);
      for (let i = 0; i < expected.length; i += 4)
        [expected[i], expected[i + 2]] = [expected[i + 2], expected[i]];
      assert(pixels.equals(expected), 'Actual HCURSOR ' + name + ' bitmap and original hotspot');
      fs.writeFileSync(
        path.join(path.dirname(report), 'original-' + name + '-recolored.png'),
        nativeImage.createFromBitmap(pixels, { width, height: width }).toPNG()
      );
      native.cursorType(false);
      assert.equal(native.cursorPolicy(), false);
      records.push({ name, width, hotspot: [hx, hy], visiblePixels: alpha, tintedPixels: color });
    }
    native.crosshair(Buffer.alloc(0), 0);
    assert.equal(native.cursorPixels().length, 0);
    window.destroy();
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: require('../package.json').version,
          records,
          limit:
            'Owned HCURSOR bitmap readback on inactive desktop. No SetCursor, ClipCursor, desktop capture or physical pointer input.',
        },
        null,
        2
      )
    );
    app.quit();
  })
  .catch((error) => {
    fs.writeFileSync(report, JSON.stringify({ passed: false, error: String(error.stack) }));
    app.exit(1);
  });
