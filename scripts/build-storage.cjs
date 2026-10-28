'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const GiB = 1024 ** 3;
const limits = { reserve: 20 * GiB, scratch: 64 * GiB, archives: 32 * GiB };

function workspace(root) {
  let current = fs.realpathSync(root);
  while (!fs.existsSync(path.join(current, '.git'))) {
    const parent = path.dirname(current);
    if (parent === current) throw Error('Build storage check requires the launcher checkout');
    current = parent;
  }
  return current;
}

function files(directory) {
  const result = [];
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) visit(path.join(file, name));
    else if (stat.isFile()) result.push({ path: file, bytes: stat.size });
  }
  if (fs.existsSync(directory)) visit(directory);
  return result;
}

function check({ free, planned = GiB, scratch = 0, archives = 0 }) {
  if (![free, planned, scratch, archives].every((n) => Number.isFinite(n) && n >= 0))
    throw Error('Invalid build storage estimate');
  if (free - planned < limits.reserve)
    throw Error(
      'Build stopped: keep 20 GiB free after the planned work. Run npm run storage:check.'
    );
  if (scratch + planned > limits.scratch)
    throw Error(
      'Build stopped: artifacts and test tools would exceed 64 GiB. Clean verified disposable copies first.'
    );
  if (archives > limits.archives)
    throw Error('Build stopped: cold staging archives exceed 32 GiB.');
  return { free, planned, scratch, archives };
}

function preflight(root, planned = GiB, full = false) {
  const owner = workspace(root),
    stat = fs.statfsSync(owner);
  let scratch = 0,
    archives = 0;
  if (full) {
    const cold = path.join(owner, 'artifacts/archived-stages') + path.sep;
    for (const name of ['artifacts', '.test-tools'])
      for (const file of files(path.join(owner, name)))
        if (file.path.startsWith(cold)) archives += file.bytes;
        else scratch += file.bytes;
  }
  return check({ free: stat.bavail * stat.bsize, planned, scratch, archives });
}

function removeTemporary(directory, parent, prefix) {
  const base = fs.realpathSync(parent),
    target = path.resolve(directory);
  if (
    path.dirname(target) !== base ||
    !path.basename(target).startsWith(prefix) ||
    fs.lstatSync(target).isSymbolicLink() ||
    fs.realpathSync(target) !== target
  )
    throw Error('Unexpected build temporary directory');
  fs.rmSync(target, { recursive: true });
}

if (require.main === module) {
  try {
    const r = preflight(path.resolve(__dirname, '..'), 2 * GiB, true);
    console.log(
      `Active scratch ${(r.scratch / GiB).toFixed(1)}/64 GiB; cold archives ${(r.archives / GiB).toFixed(1)}/32 GiB; free ${(r.free / GiB).toFixed(1)} GiB; reserve 20 GiB.`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { GiB, limits, workspace, files, check, preflight, removeTemporary };
