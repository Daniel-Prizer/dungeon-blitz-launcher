// Replay only an owned test-account's protected retained-scene packet. Never
// copy private pixels into source/releases or contact any game service here.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { chromium } = require('playwright');
const background = require('../research/gpu/background.cjs');
background.lowerSelf();
const root = path.resolve(__dirname, '..'),
  privateRoot = process.env.BLITZ_GPU_QA_ROOT,
  name = process.argv[2] || 'retained-native-effects-first';
if (!privateRoot || !path.isAbsolute(privateRoot))
  throw Error('Explicit own-account QA directory required');
if (!/^[a-z0-9-]+$/.test(name)) throw Error('Invalid owned packet name');
(async () => {
  const packetFile = path.join(privateRoot, 'scenes', name + '.json'),
    packet = fs.readFileSync(packetFile);
  if (packet.length > 48 * 1024 * 1024) throw Error('Packet too large');
  const files = new Map(
    [
      'renderer.mjs',
      'scene.mjs',
      'deadline-clock.mjs',
      'deadline-worker.mjs',
      'art-pool.mjs',
      'art-worker.mjs',
      'binary.mjs',
    ].map((n) => ['/' + n, path.join(root, n.endsWith('.mjs') ? 'src/gpu' : 'research/gpu', n)])
  );
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405);
      return res.end();
    }
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(
        '<!doctype html><style>html,body{margin:0;background:#484955}canvas{display:block}</style>'
      );
    }
    if (req.url === '/owned-scene') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(packet);
    }
    const file = files.get(req.url);
    if (!file) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader('Content-Type', 'text/javascript');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
    });
    const context = await browser.newContext({
      viewport: { width: 1152, height: 1350 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
    );
    await context.routeWebSocket('**/*', (ws) => ws.close());
    const page = await context.newPage();
    await page.goto(origin);
    background.lowerOwnedChildren();
    const result = await page.evaluate(
      async ({ sampling, individual }) => {
        const packet = await (await fetch('/owned-scene')).json();
        if (!packet?.supported || !packet.nativeReference)
          throw Error('Owned packet lacks a supported scene/reference');
        if (sampling) packet.nodes = packet.nodes.map((n) => ({ ...n, sampling }));
        const { GpuSceneRenderer, measureThroughput } = await import('/renderer.mjs'),
          { ArtworkPool } = await import('/art-pool.mjs'),
          pool = new ArtworkPool(2),
          renderer = await GpuSceneRenderer.create({
            width: packet.width,
            height: packet.height,
            individualArtwork: individual,
          });
        let images = [];
        const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).buffer;
        try {
          const start = performance.now();
          images = await Promise.all(packet.art.map((a) => pool.decode(bytes(a.png))));
          const atlas = await renderer.setArtwork(images);
          images.forEach((b) => pool.release(b));
          images = [];
          const uploadMs = performance.now() - start,
            indices = new Map(packet.art.map((a, i) => [a.id, i]));
          const scene = {
            version: 1,
            artworkRevision: atlas.artworkRevision,
            epoch: packet.epoch,
            sequence: packet.sequence,
            time: 0,
            nodes: packet.nodes.map(({ textureId, ...n }) => ({
              ...n,
              texture: indices.get(textureId),
            })),
          };
          await renderer.render(scene, { clear: packet.clear });
          const pixels = await renderer.readPixels();
          const reference = await pool.decode(bytes(packet.nativeReference)),
            canvas = new OffscreenCanvas(packet.width, packet.height),
            ctx = canvas.getContext('2d');
          ctx.drawImage(reference, 0, 0);
          pool.release(reference);
          const original = ctx.getImageData(0, 0, packet.width, packet.height).data;
          let total = 0,
            max = 0,
            above3 = 0;
          const histogram = Object.fromEntries([3, 10, 32, 64, 128].map((n) => [n, 0])),
            heat = new Uint8ClampedArray(pixels.length);
          const shown = new Uint8ClampedArray(pixels.length);
          for (let i = 0; i < pixels.length; i++) {
            const alpha = i % 4 === 3,
              at = i - (i % 4),
              expected = alpha ? original[i] : Math.round((original[i] * original[at + 3]) / 255),
              difference = Math.abs(expected - pixels[i]);
            total += difference;
            max = Math.max(max, difference);
            if (difference > 3) above3++;
            for (const n of [3, 10, 32, 64, 128]) if (difference > n) histogram[n]++;
            heat[i] = alpha ? 255 : Math.min(255, difference * 10);
            shown[i] = alpha ? pixels[i] : pixels[at + 3] ? (pixels[i] * 255) / pixels[at + 3] : 0;
          }
          for (const [id, data] of [
            ['native-reference', original],
            ['gpu-proof', shown],
            ['difference-proof', heat],
          ]) {
            const c = document.createElement('canvas');
            c.id = id;
            c.width = packet.width;
            c.height = packet.height;
            c.getContext('2d').putImageData(
              new ImageData(new Uint8ClampedArray(data), packet.width, packet.height),
              0,
              0
            );
            document.body.appendChild(c);
          }
          const throughput = null;
          return {
            width: packet.width,
            height: packet.height,
            nodes: scene.nodes.length,
            art: packet.art.length,
            uploadMs,
            atlas,
            comparison: {
              mean: total / pixels.length,
              max,
              above3,
              total: pixels.length,
              histogram,
            },
            throughput,
            adapter: renderer.adapterInfo,
          };
        } finally {
          images.forEach((b) => pool.release(b));
          pool.close();
          renderer.close();
        }
      },
      {
        sampling: ['linear', 'nearest'].includes(process.argv[3]) ? process.argv[3] : null,
        individual: process.env.BLITZ_GPU_INDIVIDUAL === '1',
      }
    );
    const suffix = process.argv[3] ? '-' + process.argv[3] : '';
    await page
      .locator('#native-reference')
      .screenshot({ path: path.join(privateRoot, 'scenes', name + suffix + '-reference.png') });
    await page
      .locator('#gpu-proof')
      .screenshot({ path: path.join(privateRoot, 'scenes', name + suffix + '-gpu.png') });
    await page
      .locator('#difference-proof')
      .screenshot({ path: path.join(privateRoot, 'scenes', name + suffix + '-difference.png') });
    result.checkedAt = new Date().toISOString();
    result.samplingOverride = process.argv[3] || null;
    result.scope =
      'Owned account world snapshot to real GPU leaf-art rendering; offline replay, not live FPS';
    fs.writeFileSync(
      path.join(privateRoot, 'scenes', name + suffix + '-parity.json'),
      JSON.stringify(result, null, 2)
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.comparison.mean > 1 || result.comparison.above3 / result.comparison.total > 0.01)
      throw Error('Owned live-scene GPU parity failed');
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.stack || e);
  process.exitCode = 1;
});
