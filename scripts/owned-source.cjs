'use strict';
// Shared build/fixture source selection. Read reviewed Git blobs, never local
// accounts, saves, environment files or modified working-tree artwork.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const defaultSource = 'D:/AI/projects/dungeon-blitz/source';
const commit = 'a409ee06a3231a67acc22f4d953c77d5b92e17b9';
const assetPrefix = 'src/client/content/localhost/p/';

function sourceRoot(source = process.env.BLITZ_SOURCE_ROOT || defaultSource) {
  return path.resolve(source);
}

function fixtureAssets(source) {
  source = sourceRoot(source);
  const listing = execFileSync(
    'git',
    ['ls-tree', '-rz', '--full-tree', commit, '--', assetPrefix],
    { cwd: source, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((row) => /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(row))
    .filter((row) => row && row[2].startsWith(assetPrefix));

  return {
    source,
    read(name) {
      if (!/^[A-Za-z0-9_]+\.swf$/.test(name)) throw Error('Invalid fixture asset name');
      const matches = listing.filter((row) => path.posix.basename(row[2]) === name);
      if (matches.length !== 1) throw Error('Missing or ambiguous pinned fixture asset: ' + name);
      return execFileSync('git', ['cat-file', 'blob', matches[0][1]], {
        cwd: source,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      });
    },
  };
}

module.exports = { defaultSource, commit, sourceRoot, fixtureAssets };
