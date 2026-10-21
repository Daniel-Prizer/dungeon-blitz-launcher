// Exact-source, read-only research attachment. Never changes packaged adapters,
// installed clients, saved preferences or a running game. Imported SWFs and
// diagnostics remain in ignored tooling output.
const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const { readSWF } = require('../src/legacy/swf-contract.cjs');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-tools/gpu-live'),
  input = path.join(root, '.test-tools/240hz-research/current.swf'),
  lib = path.join(root, '.test-tools/focus/ffdec/lib/*'),
  jar = path.join(root, '.test-tools/focus/ffdec/ffdec.jar');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const u = (value) => {
  const out = [];
  do {
    const byte = value & 127;
    value >>>= 7;
    out.push(byte | (value ? 128 : 0));
  } while (value);
  return Buffer.from(out);
};
const b = (...parts) => Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p)))),
  str = (s) => b(u(Buffer.byteLength(s)), Buffer.from(s));
function stubTag(className) {
  const pool = b([1, 1, 1, 3], str(className), str('Object'), [2, 0x16, 0, 1, 3, 7, 1, 1, 7, 1, 2]);
  const methods = b([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const types = b([0, 1, 1, 2, 0, 0, 0, 0, 1, 0, 1, 2, 1, 1, 4, 1, 0]);
  const body = (index, stack, scope, code) =>
    b([index, stack, 1, scope, scope + 1], u(code.length), code, [0, 0]);
  const abc = b(
    [16, 0, 46, 0],
    pool,
    methods,
    types,
    [3],
    body(0, 1, 1, [0xd0, 0x30, 0xd0, 0x49, 0, 0x47]),
    body(1, 1, 1, [0xd0, 0x30, 0x47]),
    body(2, 2, 0, [0xd0, 0x30, 0x65, 0, 0x60, 2, 0x30, 0x60, 2, 0x58, 0, 0x1d, 0x68, 1, 0x47])
  );
  const payload = b([1, 0, 0, 0], Buffer.from(className + '\0'), abc),
    header = Buffer.alloc(6);
  header.writeUInt16LE((82 << 6) | 63);
  header.writeUInt32LE(payload.length, 2);
  return b(header, payload);
}
function verify(original, compiled, expectedMutations = new Set()) {
  const before = readSWF(original),
    after = readSWF(compiled);
  if (!before.preamble.equals(after.preamble)) throw Error('Original preamble changed');
  const oldMain = before.tags.find((t) => t.abc?.bodies.some((m) => m.name === 'Main.Init')),
    newMain = after.tags.find((t) => t.abc?.bodies.some((m) => m.name === 'Main.Init'));
  if (
    !oldMain ||
    !newMain ||
    !oldMain.lead.equals(newMain.lead) ||
    !oldMain.abc.interfaceContract.equals(newMain.abc.interfaceContract)
  )
    throw Error('Original native interfaces changed');
  for (const kind of Object.keys(oldMain.abc.pools))
    if (
      JSON.stringify(newMain.abc.pools[kind].slice(0, oldMain.abc.pools[kind].length)) !==
      JSON.stringify(oldMain.abc.pools[kind])
    )
      throw Error('Original constant pool changed: ' + kind);
  if (newMain.abc.bodies.length !== oldMain.abc.bodies.length)
    throw Error('Original method count changed');
  const helpers = after.tags.filter((t) =>
    t.abc?.bodies.some((m) => m.name?.startsWith('BlitzGpuBridge.'))
  );
  if (helpers.length !== 1 || after.tags.length !== before.tags.length + 1)
    throw Error('Unexpected helper set');
  const native = after.tags.filter((t) => t !== helpers[0]),
    edits = [],
    seen = new Set();
  let abc = 0,
    methods = 0;
  for (let i = 0; i < before.tags.length; i++) {
    const old = before.tags[i],
      next = native[i];
    if (!next || old.type !== next.type) throw Error('Native tag identity changed');
    if (!old.abc) {
      if (!old.raw.equals(next.raw)) throw Error('Original non-ABC tag changed');
      continue;
    }
    if (
      !old.lead.equals(next.lead) ||
      !old.abc.interfaceContract.equals(next.abc.interfaceContract) ||
      old.abc.bodies.length !== next.abc.bodies.length
    )
      throw Error('Original ABC interfaces changed');
    for (const kind of Object.keys(old.abc.pools))
      if (
        JSON.stringify(next.abc.pools[kind].slice(0, old.abc.pools[kind].length)) !==
        JSON.stringify(old.abc.pools[kind])
      )
        throw Error('Original constant pool changed');
    for (const body of old.abc.bodies) {
      methods++;
      const changed = next.abc.bodies.find((m) => m.id === body.id),
        key = abc + ':' + body.id;
      if (!changed || changed.name !== body.name) throw Error('Original method identity changed');
      const differs = !changed.bytes.equals(body.bytes);
      if (differs) {
        if (body.name !== 'Main.Init' && !expectedMutations.has(key))
          throw Error('Unexpected native edit: ' + key + ' ' + body.name);
        edits.push(body.name);
        seen.add(key);
      } else if (expectedMutations.has(key)) throw Error('Expected mutation observer missing');
    }
    abc++;
  }
  if (edits.length !== expectedMutations.size + 1 || !edits.includes('Main.Init'))
    throw Error('Unexpected original edit count');
  return {
    originalMethods: methods,
    edits,
    originalPoolsAndInterfacesPreserved: true,
    allOtherTagsPreserved: true,
    mutationObserverMethods: expectedMutations.size,
  };
}
module.exports = function prepare({
  mutations = false,
  enhanced = false,
  world = false,
  probes = true,
  deployment = false,
} = {}) {
  const out = path.join(root, '.test-tools', deployment ? 'gpu-current-oct21' : 'gpu-live'),
    input = path.join(
      root,
      '.test-tools',
      deployment ? 'gpu-current-oct21/current.swf' : '240hz-research/current.swf'
    );
  fs.mkdirSync(out, { recursive: true });
  let original = fs.readFileSync(input);
  const publicSourceHash = hash(original);
  if (
    publicSourceHash !==
    (deployment
      ? 'c0abc2eac96a102b3be0246e8d3b83342bfe29e45e2c0a62e1942a051b485294'
      : '7f82ac2475ccdd8819c8616eabcbb13ad22ff94d0448dffc8a4d510862772ccc')
  )
    throw Error('Unreviewed GPU research source');
  if (enhanced) {
    if (!mutations) throw Error('Enhanced bridge requires mutation coverage');
    const baseline = fs.readFileSync(path.join(root, 'src/gpu/base-contract.json'));
    if (hash(baseline) !== '83968942171f66b11c403d2626e1f9808e27b79a7c003dbef3f7b331a514d0e7')
      throw Error('Reviewed baseline recipe changed');
    original = require('../src/legacy/adaptive-patch.cjs').patchAdaptiveClient(
      original,
      JSON.parse(baseline)
    );
    if (
      !original ||
      hash(original) !==
        (deployment
          ? 'b134a8f494a09db84265f06e54b93e0f8ca7b8788c122c53d0c36de5a445ed52'
          : 'a3311a2926506d0b60731c7489302bee30404d21b1bf49a59d8282acf58de67c')
    )
      throw Error('Reviewed enhanced source reconstruction changed');
    fs.writeFileSync(path.join(out, 'current-enhanced.swf'), original);
  }
  const sourceHash = hash(original),
    sourceInput = enhanced ? path.join(out, 'current-enhanced.swf') : input;
  fs.mkdirSync(out, { recursive: true });
  const swf = zlib.inflateSync(original.subarray(8)),
    rect = Math.ceil((5 + 4 * (swf[0] >> 3)) / 8);
  let at = rect + 4;
  while (at < swf.length) {
    const h = swf.readUInt16LE(at);
    if (h >> 6 === 1) break;
    at += (h & 63) === 63 ? 6 + swf.readUInt32LE(at + 2) : 2 + (h & 63);
  }
  const assembled = b(swf.subarray(0, at), stubTag('BlitzGpuBridge'), swf.subarray(at)),
    header = Buffer.from(original.subarray(0, 8));
  header.writeUInt32LE(assembled.length + 8, 4);
  fs.writeFileSync(path.join(out, 'stub.swf'), b(header, zlib.deflateSync(assembled)));
  const helperSource = fs.readFileSync(path.join(root, 'research/gpu/BlitzGpuBridge.as'), 'utf8'),
    marker = '// __RETAINED_SCENE_METHODS__';
  if (
    helperSource.split(marker).length !== 2 ||
    helperSource.split('__RESEARCH_WRITES_GUARDED__').length !== 2 ||
    helperSource.split('__RESEARCH_PROBES__').length !== 2
  )
    throw Error('Owned GPU helper source markers changed');
  const generated = helperSource
      .replace(
        marker,
        fs.readFileSync(path.join(root, 'research/gpu/retained-native-methods.as'), 'utf8') +
          '\n' +
          fs.readFileSync(path.join(root, 'research/gpu/native-effects.as'), 'utf8')
      )
      .replace('__RESEARCH_WRITES_GUARDED__', String(mutations))
      .replace('__RESEARCH_PROBES__', String(probes)),
    helperFile = path.join(out, 'BlitzGpuBridge.as');
  fs.writeFileSync(helperFile, generated);
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      jar,
      '-replace',
      path.join(out, 'stub.swf'),
      path.join(out, 'compiled.swf'),
      'BlitzGpuBridge',
      helperFile,
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 120000 }
  );
  execFileSync(
    'javac',
    [
      '-cp',
      lib,
      '-d',
      out,
      path.join(root, 'research/gpu/GpuBridgeBuilder.java'),
      path.join(root, 'research/gpu/BitmapWriteInventory.java'),
      path.join(root, 'research/gpu/RawMethodObserver.java'),
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 60000 }
  );
  const name = world
      ? 'bridge-world'
      : enhanced
        ? 'bridge-enhanced'
        : mutations
          ? 'bridge-mutations'
          : 'bridge',
    mutationFile = path.join(out, 'mutation-methods.txt');
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-cp',
      out + path.delimiter + lib,
      'GpuBridgeBuilder',
      sourceInput,
      path.join(out, 'compiled.swf'),
      path.join(out, name + '.swf'),
      ...(mutations
        ? [mutationFile, ...(enhanced ? ['enhanced', ...(world ? ['gpu-world'] : [])] : [])]
        : []),
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 60000 }
  );
  const output = fs.readFileSync(path.join(out, name + '.swf')),
    verification = verify(
      original,
      output,
      mutations ? new Set(fs.readFileSync(mutationFile, 'utf8').trim().split('\n')) : undefined
    );
  const evidence = {
    sourceHash,
    outputHash: hash(output),
    verification,
    scope: mutations
      ? 'Exact-source dirty observers; all original calls retained and edits reverse byte-exactly; no render replacement, gameplay, packet, input or clock edits'
      : 'Passive exact-source structure observer; no native rendering, gameplay, packet, input or clock edits',
  };
  evidence.publicSourceHash = publicSourceHash;
  evidence.enhanced = enhanced;
  evidence.worldBypass = world;
  fs.writeFileSync(
    path.join(
      out,
      world
        ? 'provenance-world.json'
        : enhanced
          ? 'provenance-enhanced.json'
          : mutations
            ? 'provenance-mutations.json'
            : 'provenance.json'
    ),
    JSON.stringify(evidence, null, 2)
  );
  return path.join(out, name + '.swf');
};
if (require.main === module)
  console.log(
    module.exports({
      mutations: process.argv.includes('--mutations'),
      enhanced: process.argv.includes('--enhanced'),
    })
  );
