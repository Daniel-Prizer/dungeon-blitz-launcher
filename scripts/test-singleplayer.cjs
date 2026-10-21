'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'prepare-legacy.cjs')], {
  stdio: 'inherit',
  windowsHide: true,
});
execFileSync(
  process.execPath,
  [path.join(__dirname, 'prepare-transition-fixture.cjs'), '--singleplayer', '--camera'],
  { stdio: 'inherit', windowsHide: true }
);
for (const [source, args] of [
  ['PrivateDesktop.cs', []],
  ['WindowCapture.cs', ['/reference:System.Drawing.dll']],
])
  execFileSync(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    [
      '/nologo',
      '/target:exe',
      '/platform:x64',
      ...args,
      '/out:' + path.join(root, '.test-tools', source.replace('.cs', '.exe')),
      path.join(__dirname, source),
    ],
    { stdio: 'inherit', windowsHide: true }
  );
const assets = path.resolve(root, '../db r/dungeon-blitz-r/src/client/content/localhost/p'),
  target = path.join(root, '.test-tools/singleplayer-assets');
fs.mkdirSync(target, { recursive: true });
const find = (dir, name) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return file;
    if (entry.isDirectory()) {
      const child = find(file, name);
      if (child) return child;
    }
  }
};
for (const name of [
  'UI_0',
  'UI_0_1',
  'UI_0_2',
  'UI_0_3',
  'UI_1',
  'UI_2',
  'UI_4',
  'UI_Library',
  'UI_Seasonal',
  'LevelsHome',
  'LevelsJC',
  'LevelsBT',
  'GlobalMap01',
]) {
  const file = find(assets, name + '.swf');
  if (!file) throw Error('Missing original local asset ' + name);
  fs.copyFileSync(file, path.join(target, name + '.swf'));
}
const env = {
  ...process.env,
  BLITZ_TEST_CLIENT: 'singleplayer',
  BLITZ_TEST_ASSET_DIR: target,
  BLITZ_PRIVATE_TEST: 'singleplayer',
  BLITZ_SINGLEPLAYER_OFFLINE: process.argv.includes('--offline') ? '1' : '0',
};
try {
  execFileSync(
    path.join(root, '.test-tools/PrivateDesktop.exe'),
    [process.execPath, path.join(__dirname, 'private-desktop-test.cjs')],
    { stdio: 'inherit', windowsHide: true, env, timeout: 245000 }
  );
} finally {
  const log = path.join(root, 'docs/private-desktop-test.log');
  if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log));
}
