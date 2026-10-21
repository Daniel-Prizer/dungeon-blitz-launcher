'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, '.test-tools/local-icon-test'),
  snapshot = path.join(root, '.test-tools/hotbar-diagnosis');
const expected = '8c32dd978d6a2e624ab6c71262d8072888258703b4cb613e1a75ec2b2b076c27';
fs.mkdirSync(dir, { recursive: true });
const input = fs.readFileSync(path.join(snapshot, 'current-en.swf'));
if (crypto.createHash('sha256').update(input).digest('hex') !== expected)
  throw Error('Unreviewed local fixture client');
execFileSync(process.execPath, [path.join(__dirname, 'prepare-legacy.cjs')], {
  stdio: 'inherit',
  windowsHide: true,
});
execFileSync(
  'javac',
  [
    '-cp',
    path.join(root, '.test-tools/focus/ffdec/lib/*'),
    '-d',
    dir,
    path.join(__dirname, 'HotbarFixtureBuilder.java'),
  ],
  { stdio: 'inherit', windowsHide: true }
);
execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-cp',
    dir + path.delimiter + path.join(root, '.test-tools/focus/ffdec/lib/*'),
    'HotbarFixtureBuilder',
    path.join(snapshot, 'current-en.swf'),
    path.join(dir, 'stub.swf'),
    expected,
  ],
  { stdio: 'inherit', windowsHide: true }
);
execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-jar',
    path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
    '-importScript',
    path.join(dir, 'stub.swf'),
    path.join(dir, 'fixture.swf'),
    path.join(root, 'test/local-icon-fixture'),
  ],
  { stdio: 'inherit', windowsHide: true }
);
const helper = path.join(root, '.test-tools/PrivateDesktop.exe');
execFileSync(
  'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/out:' + helper,
    path.join(__dirname, 'PrivateDesktop.cs'),
  ],
  { stdio: 'inherit', windowsHide: true }
);
process.env.BLITZ_PRIVATE_TEST = 'local-icons';
try {
  execFileSync(helper, [process.execPath, path.join(__dirname, 'private-desktop-test.cjs')], {
    stdio: 'inherit',
    windowsHide: true,
    timeout: 245000,
  });
} finally {
  const log = path.join(root, 'docs/private-desktop-test.log');
  if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log));
}
