'use strict';
// Read-only, unauthenticated probe. Uses an isolated headless browser and never
// visits the user's browser profile, submits login fields or contacts a local bridge.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../docs/modern-web-check');
const requested = process.argv[2] || 'https://dungeonblitz.theminesa.studio/';
const site = new URL(requested);
if (
  site.protocol !== 'https:' ||
  !['dungeonblitzr.theminesa.studio', 'dungeonblitz.theminesa.studio'].includes(site.hostname) ||
  site.username ||
  site.password ||
  site.port
)
  throw Error('Choose an official HTTPS game page.');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const response = await fetch(site.href, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Game page HTTP ' + response.status);
  const html = await response.text();
  const discovered = [...html.matchAll(/[^\s"'<>]*\.swf[^\s"'<>]*/g)].map((match) => match[0]);
  const raw = discovered.find((value) => /DungeonBlitz/i.test(value));
  const swfURL = raw
    ? new URL(raw.replace(/^`/, '').replace(/\$\{languageParam\}`;$/, ''), site.href)
    : null;
  let swfHash = null;
  if (swfURL) {
    const swf = await fetch(swfURL, { signal: AbortSignal.timeout(20000) });
    if (!swf.ok) throw Error('Game SWF HTTP ' + swf.status);
    swfHash = crypto
      .createHash('sha256')
      .update(Buffer.from(await swf.arrayBuffer()))
      .digest('hex');
  }
  let executable = chromium.executablePath();
  if (!fs.existsSync(executable))
    executable = [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ].find((file) => fs.existsSync(file));
  if (!executable) throw Error('Install a Playwright Chromium browser before this check');
  const browser = await chromium.launch({ headless: true, executablePath: executable });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/*', (route) => {
      const request = route.request(),
        url = new URL(request.url());
      return !['GET', 'HEAD'].includes(request.method()) ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        /^\/api\/(?:auth\/discord|presence)(?:\/|$)/.test(url.pathname)
        ? route.abort()
        : route.continue();
    });
    const page = await context.newPage();
    const warnings = [];
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()) && warnings.length < 40)
        warnings.push(message.text().slice(0, 500));
    });
    await page.goto(site.href, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(/ruffle|\.wasm/i.test(html) ? 15000 : 3000);
    const rendered = await page.evaluate(() => {
      const fallback = [...document.querySelectorAll('#fallback h2,#DungeonBlitz h2')].find(
        (element) =>
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
      );
      const canvases = [];
      function collect(root) {
        for (const element of root.querySelectorAll('*')) {
          if (element.tagName === 'CANVAS')
            canvases.push({ width: element.width, height: element.height });
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      }
      collect(document);
      const engine = window.RufflePlayer?.newest?.();
      // Ruffle polyfills the Flash MIME type. It does not identify an Adobe plugin.
      return {
        fallbackVisible: !!fallback,
        fallbackText: fallback?.textContent?.trim() || '',
        flashMimeExposed: !!navigator.mimeTypes['application/x-shockwave-flash'],
        flashObjects: document.querySelectorAll(
          'object[type="application/x-shockwave-flash"],embed[type="application/x-shockwave-flash"]'
        ).length,
        rufflePlayers: document.querySelectorAll('ruffle-player,ruffle-object,ruffle-embed').length,
        canvases,
        ruffleVersion: engine?.version || null,
        socketProxy: window.RufflePlayer?.config?.socketProxy || null,
      };
    });
    await page.screenshot({ path: path.join(output, 'official-site.png') });
    const result = {
      checkedAt: new Date().toISOString(),
      url: site.href,
      browser: await browser.version(),
      swfURL: swfURL?.href || null,
      swfHash,
      pageIncludesModernEngine: /ruffle|\.wasm|socketProxy/i.test(html),
      rendered,
      warnings,
      conclusion:
        rendered.fallbackVisible && rendered.fallbackText === 'Adobe Flash Player Required'
          ? 'Current official page cannot run in this modern browser.'
          : 'A changed page needs rendering and authenticated multiplayer verification; this probe cannot establish playable support.',
    };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
