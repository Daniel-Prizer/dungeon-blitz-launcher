'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { execFileSync } = require('node:child_process');
const storage = require('./build-storage.cjs');

function stageRelease(root) {
  root = fs.realpathSync(root);
  if (storage.workspace(root) !== root) throw Error('Cannot create a stage inside another stage');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid staging version');
  const artifacts = path.join(root, 'artifacts'),
    tools = path.join(root, '.test-tools');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  const pointer = path.join(tools, 'release-stage.json');
  function rejectDuplicate() {
    if (fs.existsSync(pointer)) {
      const prior = JSON.parse(fs.readFileSync(pointer));
      if (prior.version === version && fs.existsSync(prior.stage))
        throw Error('A stage already exists for this version. Reuse the recorded stage.');
    }
  }
  rejectDuplicate();
  const names = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'src',
      'assets',
      'scripts',
      'research',
      'test',
      'docs',
      'package.json',
      'package-lock.json',
      'README.md',
      'SECURITY.md',
      'AGENTS.md',
      '.prettierignore',
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true }
  )
    .split('\0')
    .filter(Boolean);
  const sources = names.map((name) => {
    const full = path.resolve(root, name),
      relative = path.relative(root, full);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('Invalid stage source');
    let file = root;
    for (const part of relative.split(path.sep)) {
      file = path.join(file, part);
      if (fs.lstatSync(file).isSymbolicLink()) throw Error('Linked stage source: ' + name);
    }
    if (!fs.statSync(full).isFile()) throw Error('Invalid stage source: ' + name);
    return { path: full, relative, bytes: fs.statSync(full).size };
  });
  const runtimeFiles = storage.files(path.join(root, 'runtime'));
  const bytes = [...sources, ...runtimeFiles].reduce((n, f) => n + f.bytes, 0);
  storage.preflight(root, bytes + 4 * storage.GiB, true);
  const lock = path.join(tools, 'stage-create.lock');
  const fd = fs.openSync(lock, 'wx');
  let stage;
  try {
    rejectDuplicate();
    stage = fs.mkdtempSync(path.join(artifacts, `release-staging-${version}-`));
    for (const file of [
      ...sources,
      ...runtimeFiles.map((f) => ({ ...f, relative: path.relative(root, f.path) })),
    ]) {
      const target = path.join(stage, file.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.path, target);
    }
    fs.mkdirSync(path.join(stage, 'docs'), { recursive: true });
    for (const dir of ['node_modules', '.test-tools'])
      fs.symlinkSync(path.join(root, dir), path.join(stage, dir), 'junction');
    const record = {
      root,
      stage,
      version,
      createdAt: new Date().toISOString(),
      sourceBytes: bytes,
    };
    fs.writeFileSync(path.join(stage, 'stage.json'), JSON.stringify(record, null, 2));
    const temp = pointer + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(record, null, 2));
    fs.renameSync(temp, pointer);
    return record;
  } catch (error) {
    if (stage) storage.removeTemporary(stage, artifacts, 'release-staging-');
    throw error;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
if (require.main === module) {
  try {
    console.log(stageRelease(path.resolve(__dirname, '..')).stage);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = stageRelease;
