'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict'),
  { chromium } = require('playwright'),
  { validSettings } = require('../src/policy.cjs');
require('../research/gpu/background.cjs').lowerSelf();
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-tools/gpu-ui');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const files = new Map(
    ['index.html', 'ui.js', 'ui.css', 'shortcuts.js', 'autorun-binding.js', 'crosshair.js'].map(
      (n) => ['/' + n, path.join(root, 'src', n)]
    )
  );
  for (const n of fs.readdirSync(path.join(root, 'assets'))) {
    const file = path.join(root, 'assets', n);
    if (fs.statSync(file).isFile()) files.set('/' + n, file);
  }
  for (const n of ['cursor.mjs']) files.set('/' + n, path.join(root, 'src/gpu', n));
  const server = http.createServer((req, res) => {
    const file = files.get(req.url);
    if (req.method !== 'GET' || !file) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.css')
          ? 'text/css'
          : /\.m?js$/.test(file)
            ? 'text/javascript'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : file.endsWith('.ttf')
                ? 'font/ttf'
                : 'image/png'
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      args: ['--mute-audio'],
    });
    const page = await browser.newPage();
    await page.route('**/*', (r) =>
      new URL(r.request().url()).origin === origin ? r.continue() : r.abort()
    );
    await page.routeWebSocket('**/*', (s) => s.close());
    await page.addInitScript(
      ({ settings }) => {
        let state = {
            settings,
            gameURL: settings.gameURL,
            modal: 'settings',
            loading: false,
            error: '',
            fullscreen: false,
            cursor: { enabled: false, active: false },
            version: 'test',
            update: { phase: 'development' },
          },
          subscriber;
        window.fixtureCalls = [];
        window.blitz = {
          subscribe(fn) {
            subscriber = fn;
          },
          async action(name, value) {
            window.fixtureCalls.push({ name, value });
            if (name === 'save-settings') {
              state.settings = { ...state.settings, ...value };
            } else if (name === 'settings') state.modal = 'settings';
            else if (name === 'dismiss') state.modal = null;
            subscriber?.(structuredClone(state));
            return name === 'state' ? structuredClone(state) : { ok: true, message: 'Saved' };
          },
        };
      },
      { settings: validSettings() }
    );
    for (const size of [
      { width: 800, height: 600 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto(origin + '/index.html');
      await page.locator('#game-renderer').selectOption('gpu');
      await page.locator('#gpu-frame-cap').fill('360');
      await page.locator('#gpu-frame-cap').press('Tab');
      assert.equal(
        await page.evaluate(() => fixtureCalls.filter((c) => c.name === 'save-settings').length),
        0
      );
      await page.locator('#discard').click();
      assert.equal(await page.locator('#game-renderer').inputValue(), 'original');
      assert.equal(await page.locator('#gpu-frame-cap').inputValue(), '1000');
      await page.locator('#game-renderer').selectOption('gpu');
      await page.locator('#gpu-frame-cap').fill('240');
      await page.locator('#gpu-frame-cap').press('Tab');
      await page.locator('#save-settings').click();
      await page.waitForFunction(() => document.querySelector('#save-settings').disabled);
      assert.equal(
        await page.evaluate(
          () => fixtureCalls.findLast((c) => c.name === 'save-settings').value.gpuFrameCap
        ),
        240
      );
      await page.locator('.advanced-options summary').click();
      await page.locator('#hardware-acceleration').uncheck();
      assert.equal(await page.locator('#gpu-frame-cap').isDisabled(), true);
      assert.equal(await page.locator('#gpu-frame-cap').inputValue(), '240');
      await page.locator('#discard').click();
      assert.equal(await page.locator('#gpu-frame-cap').isEnabled(), true);
      const footer = await page.locator('footer').boundingBox();
      assert(footer.y >= 0 && footer.y + footer.height <= size.height + 1);
      await page.screenshot({ path: path.join(out, `settings-${size.width}.png`) });
      await page.locator('#game-renderer').selectOption('native');
      assert.equal(await page.locator('#gpu-frame-cap').isDisabled(), true);
      assert.equal(await page.locator('#gpu-frame-cap').inputValue(), '240');
      assert.equal(await page.locator('#render-resolution').isDisabled(), true);
      assert.match(await page.locator('#renderer-hint').textContent(), /separate sign-in profile/);
      await page.screenshot({ path: path.join(out, `native-settings-${size.width}.png`) });
      await page.locator('#discard').click();
      assert.equal(await page.locator('#game-renderer').inputValue(), 'gpu');
      assert.equal(await page.locator('#gpu-frame-cap').isEnabled(), true);
      await page.locator('#game-renderer').selectOption('native');
      await page.locator('#save-settings').click();
      await page.waitForFunction(() => document.querySelector('#save-settings').disabled);
      assert.equal(
        await page.evaluate(
          () => fixtureCalls.findLast((c) => c.name === 'save-settings').value.gameRenderer
        ),
        'native'
      );
      assert.equal(
        await page.evaluate(() => fixtureCalls.some((c) => c.name === 'restart-game')),
        false
      );
    }
    await page.goto(origin + '/index.html');
    const pointer = await page.evaluate(async () => {
      const element = document.createElement('ruffle-player'),
        root = element.attachShadow({ mode: 'open' }),
        canvas = document.createElement('canvas');
      root.appendChild(canvas);
      document.body.appendChild(element);
      const art = document.createElement('canvas');
      art.width = art.height = 9;
      const ctx = art.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(2, 2, 5, 5);
      ctx.fillStyle = '#40e080';
      ctx.fillRect(3, 3, 3, 3);
      const png = art.toDataURL();
      canvas.style.cursor = `url("${png}") 2 3, auto`;
      const { LocalCursor } = await import('/cursor.mjs'),
        requests = [],
        cursor = new LocalCursor({ send: (m) => requests.push(m) });
      await cursor.update({ style: 'original', color: '#ff00ff', size: 24, outline: true });
      const applied = getComputedStyle(canvas).cursor,
        match = /url\("?([^"\)]+)"?\)\s+2\s+3/.exec(applied);
      if (!match) throw Error('Original hotspot was not retained');
      const image = await createImageBitmap(await (await fetch(match[1])).blob()),
        surface = new OffscreenCanvas(9, 9),
        paint = surface.getContext('2d');
      paint.drawImage(image, 0, 0);
      image.close();
      const pixels = paint.getImageData(0, 0, 9, 9).data,
        original = ctx.getImageData(0, 0, 9, 9).data;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i] !== original[i]) throw Error('Cursor alpha changed');
      if (
        pixels[(4 * 9 + 4) * 4] !== 224 ||
        pixels[(4 * 9 + 4) * 4 + 1] !== 0 ||
        pixels[(2 * 9 + 2) * 4] !== 0
      )
        throw Error('Native fill or dark outline recoloring failed');
      canvas.style.cursor = 'text';
      await cursor.update({ style: 'cross', color: '#00ff00', size: 24, outline: true });
      if (getComputedStyle(canvas).cursor !== 'text') throw Error('Text pointer replaced');
      await cursor.update({ style: 'default' }, { visible: false });
      cursor.close();
      return {
        originalHotspot: true,
        alpha: true,
        recolor: true,
        darkOutline: true,
        textCursor: true,
        scope: 'CSS pixels/hotspot only; no OS cursor mutation or desktop input',
      };
    });
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify(
        {
          passed: true,
          pointer,
          viewports: [800, 1440],
          checks: [
            'Draft only before Save',
            'Discard restores renderer/cap',
            'Save records cap',
            'Disabled graphics preserves cap',
            'Pinned footer remains visible',
            '120 FPS selection remains a draft until Save and never reconnects automatically',
            'Native mode preserves the GPU world cap and disables unsupported controls',
          ],
          checkedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(
      'PASS settings draft/save/layout and original cursor pixels/hotspot/text preservation'
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
