'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  { NtExecutable, NtExecutableResource } = require('resedit');
module.exports = function missingArchiveEntry(executable, directory, desktop) {
  const target = path.join(path.dirname(executable), 'ArchiveAdmissionNegativeFixture.exe');
  fs.copyFileSync(executable, target);
  const exe = NtExecutable.from(fs.readFileSync(target)),
    res = NtExecutableResource.from(exe),
    entry = res.entries.find((e) => e.type === 'INTEGRITY' && e.id === 'ELECTRONASAR'),
    original = JSON.parse(Buffer.from(entry.bin).toString('utf8')),
    table = original.filter((e) => !e.file.endsWith('singleplayer.asar'));
  assert.equal(table.length, original.length - 1);
  const bytes = Buffer.from(JSON.stringify(table));
  entry.bin = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  res.outputResource(exe);
  fs.writeFileSync(target, Buffer.from(exe.generate()));
  function run(config) {
    const assert = require('assert/strict'),
      fs = require('fs'),
      result = require('child_process').spawnSync(config.executable, [], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 15000,
      });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Failed to find file integrity info for resources\\runtime\\singleplayer\.asar/
    );
    fs.writeFileSync(
      config.receipt,
      JSON.stringify({
        ok: true,
        scope:
          'Exact production fuses reject a missing secondary archive entry before the private world starts',
        exitCode: result.status,
      })
    );
  }
  const runner = path.join(directory, 'missing-integrity-entry.cjs'),
    receipt = path.join(directory, 'missing-integrity-entry.json');
  fs.writeFileSync(
    runner,
    '(' + run.toString() + ')(' + JSON.stringify({ executable: target, receipt }) + ');'
  );
  execFileSync(desktop, [process.execPath, runner], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 20000,
  });
  assert(JSON.parse(fs.readFileSync(receipt)).ok);
};
