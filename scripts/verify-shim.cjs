'use strict';
// Execute the exact root-shim IL through a naturally named verification probe.
// Only --verify is used; no launcher/game process or player profile is opened.
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
module.exports = function verify(
  root = path.resolve(__dirname, '..'),
  layoutRoot = root,
  version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid verification version');
  const [major, minor, patch] = version.split('.'),
    tools = path.join(root, '.test-tools');
  fs.mkdirSync(tools, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tools, 'shim-check-')),
    source = path.join(directory, 'Launcher.cs'),
    probe = path.join(directory, 'RootLayoutVerificationProbe.exe'),
    compareSource = path.join(directory, 'CodeVerification.cs'),
    compare = path.join(directory, 'RootCodeVerification.exe'),
    csc = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
  try {
    const core = path.join(
        layoutRoot,
        'release',
        version,
        'Dungeon Blitz Launcher-win32-x64/Dungeon Blitz Launcher.exe'
      ),
      copied = path.join(
        directory,
        'release',
        version,
        'Dungeon Blitz Launcher-win32-x64/Dungeon Blitz Launcher.exe'
      );
    fs.mkdirSync(path.dirname(copied), { recursive: true });
    fs.copyFileSync(core, copied);
    fs.writeFileSync(
      source,
      fs
        .readFileSync(path.join(root, 'src/Launcher.cs'), 'utf8')
        .replaceAll('@@VERSION@@', version)
        .replaceAll('@@MAJOR@@', major)
        .replaceAll('@@MINOR@@', minor)
        .replaceAll('@@PATCH@@', patch)
    );
    execFileSync(
      csc,
      [
        '/nologo',
        '/target:winexe',
        '/platform:x64',
        '/r:System.Windows.Forms.dll',
        '/out:' + probe,
        source,
      ],
      { windowsHide: true, stdio: 'pipe' }
    );
    fs.writeFileSync(
      compareSource,
      'using System;using System.IO;using System.Linq;using System.Diagnostics;using System.Reflection;public static class Verify{public static int Main(string[] args){AppDomain.CurrentDomain.ReflectionOnlyAssemblyResolve+=(s,e)=>Assembly.ReflectionOnlyLoad(e.Name);var a=Assembly.ReflectionOnlyLoad(File.ReadAllBytes(args[0])).GetType("Launcher").GetMethod("Main").GetMethodBody().GetILAsByteArray();var b=Assembly.ReflectionOnlyLoad(File.ReadAllBytes(args[1])).GetType("Launcher").GetMethod("Main").GetMethodBody().GetILAsByteArray();var v=FileVersionInfo.GetVersionInfo(args[0]);if(!a.SequenceEqual(b)||v.FileMajorPart!=' +
        major +
        '||v.FileMinorPart!=' +
        minor +
        '||v.FileBuildPart!=' +
        patch +
        ')return 1;return 0;}}'
    );
    execFileSync(
      csc,
      ['/nologo', '/target:exe', '/platform:x64', '/out:' + compare, compareSource],
      { windowsHide: true, stdio: 'pipe' }
    );
    execFileSync(compare, [path.join(layoutRoot, 'Dungeon Blitz Launcher.exe'), probe], {
      windowsHide: true,
      stdio: 'pipe',
    });
    execFileSync(probe, ['--verify'], { windowsHide: true, stdio: 'pipe' });
    const absent = path.join(directory, 'absent-core.exe');
    fs.renameSync(copied, absent);
    let rejected = false;
    try {
      execFileSync(probe, ['--verify'], { windowsHide: true, stdio: 'pipe' });
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error('Root verification accepted a missing core');
    return {
      passed: true,
      version,
      checks: [
        'Product root version matches',
        'Product and probe Main IL are byte-identical',
        'Actual compiled root logic verifies matching core',
        'Missing core is rejected',
      ],
      scope: 'No production launcher/game process was started',
    };
  } finally {
    const actual = fs.realpathSync(directory),
      parent = fs.realpathSync(tools);
    if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('shim-check-'))
      throw Error('Verification cleanup escaped its fresh directory');
    fs.rmSync(actual, { recursive: true, force: true });
  }
};
if (require.main === module) {
  try {
    console.log(JSON.stringify(module.exports(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
