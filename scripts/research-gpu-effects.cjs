// Native-effect pixel parity in the official engine. Owned tiny scene only;
// all sockets/API requests blocked, no profile/account or native game process.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { chromium } = require('playwright');
const background = require('../research/gpu/background.cjs');
background.lowerSelf();
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-tools/gpu-live'),
  origin = 'https://dungeonblitz.theminesa.studio';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
  const bridge = fs.readFileSync(path.join(out, 'bridge-mutations.swf')),
    evidence = JSON.parse(fs.readFileSync(path.join(out, 'provenance-mutations.json'), 'utf8'));
  if (hash(bridge) !== evidence.outputHash) throw Error('Bridge integrity mismatch');
  let browser,
    context,
    checked = false;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
    });
    context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', async (route) => {
      const r = route.request(),
        u = new URL(r.url());
      if (
        ![origin, 'https://dungeonblitzr.theminesa.studio'].includes(u.origin) ||
        r.method() !== 'GET' ||
        u.pathname.startsWith('/api/')
      )
        return route.abort();
      if (u.pathname.startsWith('/__gpu_test/')) {
        const name = u.pathname.slice('/__gpu_test/'.length);
        if (
          ![
            'renderer.mjs',
            'scene.mjs',
            'deadline-clock.mjs',
            'deadline-worker.mjs',
            'art-pool.mjs',
            'art-worker.mjs',
            'binary.mjs',
          ].includes(name)
        )
          return route.abort();
        return route.fulfill({
          contentType: 'text/javascript',
          body: fs.readFileSync(
            path.join(root, name.endsWith('.mjs') ? 'src/gpu' : 'research/gpu', name)
          ),
        });
      }
      if (u.pathname.endsWith('/DungeonBlitz.swf')) {
        const response = await route.fetch(),
          bytes = await response.body();
        if (hash(bytes) !== evidence.sourceHash) throw Error('Fresh native source changed');
        checked = true;
        return route.fulfill({
          response,
          body: bridge,
          headers: {
            ...response.headers(),
            'cache-control': 'no-store',
            'content-length': String(bridge.length),
          },
        });
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*', (ws) => ws.close());
    const page = await context.newPage();
    await page.goto(origin + '/web');
    background.lowerOwnedChildren();
    await page.waitForFunction(() => {
      try {
        return document
          .querySelector('ruffle-player')
          ?.ruffle()
          .callExternalInterface('BlitzGpuStructure')?.ready;
      } catch {
        return false;
      }
    });
    const result = await page.evaluate(async () => {
      const packet = document
        .querySelector('ruffle-player')
        .ruffle()
        .callExternalInterface('BlitzGpuEffectProbe');
      if (!packet?.supported) throw Error('Native effect export failed: ' + JSON.stringify(packet));
      const { GpuSceneRenderer } = await import('/__gpu_test/renderer.mjs'),
        { ArtworkPool } = await import('/__gpu_test/art-pool.mjs');
      const pool = new ArtworkPool(2),
        renderer = await GpuSceneRenderer.create({ width: packet.width, height: packet.height });
      let images = [];
      const bytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
      try {
        images = await Promise.all(packet.art.map((a) => pool.decode(bytes(a.png))));
        const atlas = await renderer.setArtwork(images);
        images.forEach((b) => pool.release(b));
        images = [];
        const indices = new Map(packet.art.map((a, i) => [a.id, i]));
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
        // WebGPU target stores premultiplied channels. ImageData exposes straight
        // RGBA; compare in the same representation and unpremultiply only to show
        // the diagnostic. Transparent RGB is otherwise meaningless noise.
        let total = 0,
          max = 0,
          above3 = 0;
        const shown = new Uint8ClampedArray(pixels.length);
        for (let i = 0; i < pixels.length; i++) {
          const alpha = i % 4 === 3,
            at = i - (i % 4),
            expected = alpha ? original[i] : Math.round((original[i] * original[at + 3]) / 255);
          const difference = Math.abs(expected - pixels[i]);
          total += difference;
          max = Math.max(max, difference);
          if (difference > 3) above3++;
          shown[i] = alpha ? pixels[i] : pixels[at + 3] ? (pixels[i] * 255) / pixels[at + 3] : 0;
        }
        document.body.replaceChildren();
        document.body.style = 'margin:0;background:#484955';
        const proof = document.createElement('div');
        proof.id = 'effect-proof';
        proof.style = 'display:flex;width:max-content;gap:8px;padding:8px';
        for (const data of [original, shown]) {
          const c = document.createElement('canvas');
          c.width = packet.width;
          c.height = packet.height;
          c.getContext('2d').putImageData(
            new ImageData(new Uint8ClampedArray(data), packet.width, packet.height),
            0,
            0
          );
          proof.appendChild(c);
        }
        document.body.appendChild(proof);
        return {
          nodes: scene.nodes.length,
          art: packet.art.length,
          diagnosticArt: packet.art.map((a) => a.png),
          nodesData: packet.nodes,
          comparison: { mean: total / pixels.length, max, above3, total: pixels.length },
          adapter: renderer.adapterInfo,
        };
      } finally {
        images.forEach((b) => pool.release(b));
        pool.close();
        renderer.close();
      }
    });
    if (!checked) throw Error('Fresh source not checked');
    result.diagnosticArt.forEach((a, i) =>
      fs.writeFileSync(path.join(out, 'owned-effect-art-' + i + '.png'), Buffer.from(a, 'base64'))
    );
    delete result.diagnosticArt;
    result.sourceHash = evidence.sourceHash;
    result.bridgeHash = evidence.outputHash;
    result.checkedAt = new Date().toISOString();
    await page
      .locator('#effect-proof')
      .screenshot({ path: path.join(out, 'native-effect-parity.png') });
    fs.writeFileSync(path.join(out, 'effects-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (result.comparison.mean > 1 || result.comparison.above3 / result.comparison.total > 0.01)
      throw Error('Native effect parity failed');
  } finally {
    if (context) await context.unrouteAll({ behavior: 'ignoreErrors' });
    if (browser) await browser.close();
  }
})().catch((e) => {
  console.error(e.stack || e);
  process.exitCode = 1;
});
