'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { publicBytes, originalAddress } = require('./game-source.cjs');
const { adaptClient } = require('./legacy/client-adapter.cjs');
const { paths: audioPaths, createAudioCache } = require('./native-player-audio.cjs');

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const recipes = [
  'adaptive-contract-effects-oct28.json',
  'adaptive-contract-backdrop-oct19.json',
  'adaptive-contract.json',
  'adaptive-contract-oct15.json',
  'adaptive-contract-oct16.json',
  'adaptive-contract-oct17.json',
  'adaptive-contract-recovery-oct17.json',
  'adaptive-contract-map-oct19.json',
];

function manifestFiles(xml) {
  const records = [];
  for (const match of xml.matchAll(/<File\s+([^<>]+?)\s*\/?\s*>/g)) {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([A-Za-z]+)="([^"<>]*)"/g)].map((value) => [value[1], value[2]])
    );
    if (
      !attrs.Name ||
      !/^[a-z0-9]{1,12}$/.test(attrs.Version || '') ||
      !/^(?:sounds\/)?[A-Za-z0-9_]+\.(?:swf|swz|xml)$/.test(attrs.Name)
    )
      throw Error('Unsupported resource manifest entry');
    records.push({
      name: attrs.Name,
      pathname: '/p/' + attrs.Version + '/' + attrs.Name,
      stage: attrs.Stage,
    });
  }
  if (!records.length || records.length > 256) throw Error('Unexpected resource manifest size');
  return records;
}

async function prepare(root, address, signal, cacheDirectory) {
  const preparationSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
    : AbortSignal.timeout(90000);
  const selected = originalAddress(address);
  if (!selected) throw Error('Native player requires an official multiplayer origin');
  const origin = new URL(selected).origin;
  const html = (await publicBytes(selected, 1024 * 1024, preparationSignal)).toString('utf8');
  const reference = html.match(
    /(?:const\s+swfUrl\s*=\s*`)(\/p\/[a-z0-9]+\/DungeonBlitz\.swf\?fv=[a-z0-9]+&gv=[a-z0-9]+&clientrev=swf-[a-f0-9]+)/
  )?.[1];
  if (!reference) throw Error('Public client reference changed');
  const sourceURL = new URL(reference, origin);
  const language = new URL(selected).searchParams.get('lang');
  if (language) sourceURL.searchParams.set('lang', language);
  const source = await publicBytes(sourceURL.href, 4 * 1024 * 1024, preparationSignal);
  const admission = require('./native-player-admission.json');
  if (!admission.clients.includes(digest(source)))
    throw Error(
      'This game revision has not been qualified for High FPS. Original rendering is active.'
    );
  const multiplayer = recipes.map((name) =>
    JSON.parse(fs.readFileSync(path.join(root, 'game/resources', name)))
  );
  const adapted = adaptClient(source, selected, { multiplayer });
  if (adapted.mode !== 'contract' || !adapted.patched)
    throw Error('Current client has no complete native presentation contract');
  if (digest(adapted.patched) !== admission.enhanced[digest(source)])
    throw Error(
      'The enhanced client changed after native qualification. Original rendering is active.'
    );

  const directory = path.resolve(cacheDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const known = require('./gpu/assets.json').assets;
  const masterPath = path.posix.dirname(sourceURL.pathname) + '/masterFileList.xml';
  const master = await publicBytes(origin + masterPath, 1024 * 1024, preparationSignal);
  const entries = manifestFiles(master.toString('utf8'));
  const artworkNames = entries
    .filter((entry) => entry.name.endsWith('.swf'))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(artworkNames) !== JSON.stringify(admission.artwork))
    throw Error('The native artwork manifest changed. Original rendering is active.');
  // Level libraries load on demand and are absent from masterFileList.xml.
  const levels = levelFiles(known, admission.levels);
  const files = new Map([
    [sourceURL.pathname, { bytes: adapted.patched, type: 'application/x-shockwave-flash' }],
    [masterPath, { bytes: master, type: 'application/xml' }],
  ]);
  const evidence = [];
  let total = 0;
  async function admitted(entry) {
    const expected = known.find((value) => value.name === entry.name);
    if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256))
      throw Error('Unreviewed native artwork: ' + entry.name);
    const cached = path.join(directory, expected.sha256 + '.swf');
    let bytes;
    try {
      const value = fs.readFileSync(cached);
      if (digest(value) === expected.sha256) bytes = value;
    } catch {}
    // The live URL is checked even when an older verified cache exists.
    // A same-path deployment must not be hidden by that cache.
    const current = await publicBytes(origin + entry.pathname, 16 * 1024 * 1024, preparationSignal);
    const sha256 = digest(current);
    if (sha256 !== expected.sha256) throw Error('Native artwork changed: ' + entry.name);
    total += current.length;
    if (total > 256 * 1024 * 1024) throw Error('Native artwork budget exceeded');
    if (!bytes) {
      bytes = current;
      fs.writeFileSync(cached, bytes, { flag: 'w' });
    }
    files.set(entry.pathname, { file: cached, type: 'application/x-shockwave-flash' });
    evidence.push({ name: entry.name, pathname: entry.pathname, sha256, bytes: bytes.length });
  }
  const swfs = [...entries.filter((entry) => entry.name.endsWith('.swf')), ...levels];
  // Two bounded downloads; no account endpoints, cookies or persisted sessions.
  for (let index = 0; index < swfs.length; index += 2)
    await Promise.all(swfs.slice(index, index + 2).map(admitted));

  for (const entry of entries.filter((entry) => !entry.name.endsWith('.swf'))) {
    files.set(entry.pathname, {
      publicURL: origin + entry.pathname,
      type: entry.name.endsWith('.xml') ? 'application/xml' : 'application/octet-stream',
    });
  }
  // The original client requests these through the same selected asset origin.
  for (const name of ['devSettings.xml']) {
    const pathname = path.posix.dirname(sourceURL.pathname) + '/' + name;
    files.set(pathname, { publicURL: origin + pathname, type: 'application/xml' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const lifetime = new AbortController();
  for (const pathname of audioPaths) files.set(pathname, { audio: true, type: 'audio/mpeg' });
  const audio = createAudioCache((pathname) =>
    publicBytes(origin + pathname, 8 * 1024 * 1024, lifetime.signal)
  );
  let brokerURL;
  const server = http.createServer(async (request, response) => {
    if (request.headers['x-blitz-resource-token'] !== token) {
      response.writeHead(403);
      return response.end();
    }
    if (request.method !== 'GET') {
      response.writeHead(405);
      return response.end();
    }
    let url;
    try {
      url = new URL(request.url, brokerURL);
    } catch {
      response.writeHead(400);
      return response.end();
    }
    if (url.origin !== brokerURL || url.username || url.password || url.hash) {
      response.writeHead(400);
      return response.end();
    }
    const resource = files.get(url.pathname);
    if (!resource) {
      response.writeHead(404);
      return response.end();
    }
    try {
      const bytes =
        resource.bytes ||
        (resource.audio ? await audio.load(url.pathname) : null) ||
        (resource.file
          ? fs.readFileSync(resource.file)
          : await publicBytes(resource.publicURL, 8 * 1024 * 1024, lifetime.signal));
      response.setHeader('Content-Type', resource.type);
      response.setHeader('Cache-Control', 'no-store');
      response.end(bytes);
    } catch {
      response.writeHead(502);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  brokerURL = 'http://127.0.0.1:' + server.address().port;
  let closed = false;
  return {
    sourceURL: sourceURL.href,
    tcpHost: admission.tcpHost,
    origin,
    brokerURL,
    token,
    movieURL: brokerURL + sourceURL.pathname + sourceURL.search,
    evidence: {
      sourceURL: sourceURL.href,
      sourceSha256: digest(source),
      enhancedSha256: digest(adapted.patched),
      mode: adapted.mode,
      artwork: evidence,
    },
    close: () => {
      if (closed) return;
      closed = true;
      audio.close();
      lifetime.abort();
      server.closeAllConnections();
      server.close();
    },
  };
}

function levelFiles(known, names) {
  if (
    !Array.isArray(names) ||
    !names.length ||
    names.length > 32 ||
    names.some((name) => !/^Levels[A-Za-z0-9]+\.swf$/.test(name))
  )
    throw Error('Invalid native level inventory');
  const levels = known
    .filter((entry) => names.includes(entry.name))
    .map((entry) => {
      if (
        !/^\/p\/[a-z0-9]+\/Levels[A-Za-z0-9]+\.swf$/.test(entry.path) ||
        path.posix.basename(entry.path) !== entry.name
      )
        throw Error('Invalid native level resource');
      return { name: entry.name, pathname: entry.path };
    });
  if (JSON.stringify(levels.map((entry) => entry.name).sort()) !== JSON.stringify(names))
    throw Error('The native level inventory changed. Original rendering is active.');
  return levels;
}

module.exports = { prepare, manifestFiles, levelFiles };
