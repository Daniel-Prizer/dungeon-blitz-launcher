'use strict';
// Compile only launcher-owned alias classes. Imported UI artwork is never
// included in the committed/shipped recipe; every native asset tag is retained.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const { readSWF, encodeTag, writeSWF } = require('../src/legacy/swf-contract.cjs');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, '.test-tools/icon-fallback');
fs.mkdirSync(dir, { recursive: true });
const sources = [
  path.join(root, '.test-tools/hotbar-diagnosis/assets/UI_1.swf'),
  path.join(root, '.test-tools/singleplayer-assets/UI_1.swf'),
];
const names = ['a_PowerIcon_MeteorROR', 'a_PowerIcon_CrimsonShot'],
  fallbacks = ['a_PowerIcon_Meteor', 'a_PowerIcon_FireBall'];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const reviewedSources = [
  '793c7e0b9dd900db3c634e7b8f5ab8db7d21f9c2cef27c27b0e2cee250bdcb7a',
  'a38da054b2bcfa17206dea7a488f5bf83b2cb1f5a0ff4907af0cfcae1b0533a4',
];
for (let i = 0; i < sources.length; i++)
  if (hash(fs.readFileSync(sources[i])) !== reviewedSources[i])
    throw Error('UI asset changed; review before compiling aliases');
const u = (value) => {
  const out = [];
  do {
    const b = value & 127;
    value >>>= 7;
    out.push(b | (value ? 128 : 0));
  } while (value);
  return Buffer.from(out);
};
const b = (...parts) => Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
const str = (s) => b(u(Buffer.byteLength(s)), Buffer.from(s));
function stub(name) {
  const pool = b([1, 1, 1, 3], str(name), str('Object'), [2, 0x16, 0, 1, 3, 7, 1, 1, 7, 1, 2]);
  const methods = b([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    types = b([0, 1, 1, 2, 0, 0, 0, 0, 1, 0, 1, 2, 1, 1, 4, 1, 0]);
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
  return encodeTag(82, b([1, 0, 0, 0], Buffer.from(name + '\0'), abc));
}
const input = fs.readFileSync(sources[0]),
  swf = readSWF(input),
  tags = [];
let added = false;
for (const tag of swf.tags) {
  if (!added && tag.type === 1) {
    tags.push(...names.map(stub));
    added = true;
  }
  tags.push(tag.raw);
}
if (!added) throw Error('Missing asset frame');
fs.writeFileSync(path.join(dir, 'stub.swf'), writeSWF(swf, tags));
let previous = path.join(dir, 'stub.swf');
const jar = path.join(root, '.test-tools/focus/ffdec/ffdec.jar');
for (const name of names) {
  const output = path.join(dir, name + '.swf');
  execFileSync(
    'java',
    [
      '-Djava.awt.headless=true',
      '-jar',
      jar,
      '-replace',
      previous,
      output,
      name,
      path.join(root, 'src/legacy/icon-fallback', name + '.as'),
    ],
    { stdio: 'inherit', windowsHide: true }
  );
  previous = output;
}
const compiled = readSWF(fs.readFileSync(previous));
const helpers = names.map((name, index) => {
  const tag = compiled.tags.find(
    (t) => t.abc && t.abc.bodies.some((body) => body.name === name + '.iinit')
  );
  if (!tag) throw Error('Missing compiled alias ' + name);
  return {
    name,
    fallback: fallbacks[index],
    hash: hash(tag.raw),
    data: tag.raw.toString('base64'),
  };
});
for (const tag of swf.tags)
  if (!compiled.tags.some((t) => t.raw.equals(tag.raw)))
    throw Error('Compiler changed native artwork/code');
if (compiled.tags.length !== swf.tags.length + helpers.length)
  throw Error('Unexpected compiled tags');
const recipe = { format: 1, reviewedAt: '2026-10-13', sources: reviewedSources, helpers };
fs.writeFileSync(
  path.join(root, 'src/legacy/local-icon-fallback.json'),
  JSON.stringify(recipe, null, 2) + '\n'
);
console.log('Compiled two local-only icon aliases; every original asset tag preserved.');
