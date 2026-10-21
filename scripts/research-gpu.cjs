// Standalone offline probe: never launches Flash/Blitz, reads a profile, or
// connects to game/Discord services. No install, global GPU flags or OS input.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto');
const { chromium } = require('playwright');
const background = require('../research/gpu/background.cjs');
background.lowerSelf();
const { WebSocketServer } = require('ws');
const root = path.resolve(__dirname, '..'),
  output = path.join(root, '.test-tools/gpu-renderer');
const source = path.join(root, 'research/gpu'),
  art = path.join(root, '.test-tools/omm-backdrop-preview');
const files = new Map(
  [
    'scene.mjs',
    'renderer.mjs',
    'deadline-clock.mjs',
    'deadline-worker.mjs',
    'host-clock.mjs',
    'pulse-clock.mjs',
    'cooperative-clock.mjs',
    'player.mjs',
    'art-worker.mjs',
    'binary.mjs',
    'art-pool.mjs',
    'probe.html',
  ].map((name) => [
    '/' + name,
    path.join(root, name.endsWith('.mjs') ? 'src/gpu' : 'research/gpu', name),
  ])
);
files.set('/art/cave-a.png', path.join(art, 'DefineSprite_616_a_Scene_OMMParallax_Eye5/1.png'));
files.set('/art/cave-b.png', path.join(art, 'DefineSprite_615_a_Scene_OMMParallax_Eye5copy/1.png'));
(async () => {
  const nativeClock = require(require('./prepare-gpu-deadline.cjs')()),
    pulse = require(require('./prepare-gpu-deadline.cjs')(true));
  for (const file of files.values())
    if (!fs.existsSync(file))
      throw Error('Missing offline fixture file: ' + path.relative(root, file));
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = files.get(req.url);
    if (!file || req.method !== 'GET') {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html'
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; img-src 'self' blob:"
    );
    fs.createReadStream(file).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 });
  server.on('upgrade', (req, socket, head) => {
    if (
      req.url !== '/private-clock' ||
      req.headers.origin !== 'http://127.0.0.1:' + server.address().port ||
      wss.clients.size
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    pulse.start(0.5, () => {
      if (ws.readyState === 1 && ws.bufferedAmount < 64) ws.send('1');
    });
    ws.once('close', () => pulse.stop());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const executable = [
      chromium.executablePath(),
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ].find((file) => fs.existsSync(file));
    if (!executable) throw Error('No installed headless browser');
    browser = await chromium.launch({
      headless: true,
      executablePath: executable,
      args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
    });
    const context = await browser.newContext({
      viewport: { width: 256, height: 128 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin && route.request().method() === 'GET'
        ? route.continue()
        : route.abort()
    );
    await context.routeWebSocket('**/*', (ws) =>
      ws.url() === origin.replace('http:', 'ws:') + '/private-clock'
        ? ws.connectToServer()
        : ws.close()
    );
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('privateRenderWait', (delay) => nativeClock.wait(delay));
    await page.goto(origin + '/probe.html');
    background.lowerOwnedChildren();
    await page.waitForFunction(() => typeof window.verifyGpu === 'function');
    const result = await Promise.race([
      page.evaluate(() => window.verifyGpu()),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('Bounded GPU probe timed out')), 45000).unref()
      ),
    ]);
    if (errors.length) throw Error(errors.join('\n'));
    result.browser = await browser.version();
    result.checkedAt = new Date().toISOString();
    result.artwork = [...files]
      .filter(([url]) => url.startsWith('/art/'))
      .map(([url, file]) => ({
        url,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      }));
    await page.screenshot({ path: path.join(output, 'original-cave-gpu.png') });
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    pulse.stop();
    for (const ws of wss.clients) ws.close();
    if (browser) await browser.close();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
