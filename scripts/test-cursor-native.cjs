'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  helper = path.join(root, '.test-tools/PrivateDesktop.exe');
(async () => {
  await require('./build-game-window.cjs')();
  execFileSync(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    [
      '/nologo',
      '/target:exe',
      '/platform:x64',
      `/out:${helper}`,
      path.join(__dirname, 'PrivateDesktop.cs'),
    ],
    { windowsHide: true }
  );
  const env = {};
  for (const name of [
    'SystemRoot',
    'SystemDrive',
    'WINDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'PATH',
  ])
    if (process.env[name]) env[name] = process.env[name];
  env.BLITZ_HOST_TEST = '1';
  const output = path.join(root, 'docs/crosshair-tests');
  fs.mkdirSync(output, { recursive: true });
  env.BLITZ_CURSOR_REPORT = path.join(output, 'native-results.json');
  execFileSync(helper, [require('electron'), path.join(__dirname, 'cursor-native-fixture.cjs')], {
    windowsHide: true,
    env,
    stdio: 'inherit',
    timeout: 30000,
  });
  const result = JSON.parse(fs.readFileSync(env.BLITZ_CURSOR_REPORT));
  if (!result.passed) throw Error(result.error);
  console.log(
    'PASS native arrow, hand and original crosshair recoloring, noncentral hotspots and restoration; shared OS cursor untouched.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
