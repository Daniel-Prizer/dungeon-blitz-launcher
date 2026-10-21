'use strict';
// Explicit local rollback uses the same pinned signing key and complete file
// hashes as updates. Automatic update version/rollback protections stay intact.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const disk = process.versions.electron ? require('original-fs') : fs;
const { verifyManifest } = require('./update-policy.cjs');
async function stagePrevious({
  envelope,
  key,
  version,
  current,
  root,
  stage,
  signal,
  progress = () => {},
}) {
  if (version === current) throw Error('The saved previous launcher is already selected.');
  const manifest = verifyManifest(envelope, key, '0.0.0');
  if (manifest.version !== version) throw Error('Previous release and signature disagree');
  const sourceRoot = path.resolve(root);
  for (let dir = sourceRoot; ; dir = path.dirname(dir)) {
    if ((await disk.promises.lstat(dir)).isSymbolicLink())
      throw Error('Installation links rejected');
    if (path.dirname(dir) === dir) break;
  }
  let completed = 0;
  for (const item of manifest.files) {
    signal?.throwIfAborted();
    const source = path.join(
      root,
      item.path === 'Dungeon Blitz Launcher.exe' ? 'Dungeon Blitz Launcher.previous.exe' : item.path
    );
    for (let dir = source; dir !== sourceRoot; dir = path.dirname(dir)) {
      const s = await disk.promises.lstat(dir);
      if (s.isSymbolicLink()) throw Error('Previous build links rejected');
    }
    const stat = await disk.promises.lstat(source);
    if (!stat.isFile() || stat.size !== item.size) throw Error('Previous build is incomplete');
    const destination = path.join(stage, item.path);
    await disk.promises.mkdir(path.dirname(destination), { recursive: true });
    await disk.promises.copyFile(source, destination, disk.constants.COPYFILE_EXCL);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of disk.createReadStream(destination, { signal })) {
      bytes += chunk.length;
      if (bytes > item.size) throw Error('Previous build changed');
      hash.update(chunk);
    }
    if (bytes !== item.size || hash.digest('hex') !== item.sha256)
      throw Error('Previous build does not match its signed release');
    progress(++completed, manifest.files.length);
  }
  return manifest;
}
async function restorePrevious({ updater, snapshot, disableUpdates, close }) {
  if (!updater?.prepareRollback)
    throw Error('Install the complete launcher to restore a previous version.');
  await updater.prepareRollback();
  await snapshot();
  await disableUpdates();
  if (!updater.installAfterExit(true, true))
    throw Error('The previous version could not be scheduled.');
  updater.installAfterExit = () => false;
  close();
}
module.exports = { stagePrevious, restorePrevious };
