const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, '.test-tools/input-shortcuts');
fs.mkdirSync(dir, { recursive: true });
const lib = path.join(root, '.test-tools/focus/ffdec/lib/*'),
  stub = path.join(dir, 'typed-facing.swf');
execFileSync(
  'javac',
  ['-cp', lib, '-d', dir, path.join(__dirname, 'ShortcutFixtureBuilder.java')],
  { windowsHide: true, stdio: 'inherit' }
);
execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-cp',
    dir + path.delimiter + lib,
    'ShortcutFixtureBuilder',
    path.join(root, '.test-tools/audio-adaptive/audio.swf'),
    stub,
  ],
  { windowsHide: true, stdio: 'inherit' }
);
execFileSync(
  'java',
  [
    '-Djava.awt.headless=true',
    '-jar',
    path.join(root, '.test-tools/focus/ffdec/ffdec.jar'),
    '-importScript',
    stub,
    path.join(dir, 'fixture.swf'),
    path.join(root, 'test/shortcut-fixture'),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
