# Development

## Requirements

- Windows 10 or later, x64.
- Node.js 24, npm and JDK 17 or later on PATH.
- The Windows .NET Framework compiler used by the native helpers.
- An official Dungeon Blitz R runtime for the initial local Flash import, or an existing complete hash-verified import.

The runtime, downloaded game assets, test profiles and releases are excluded from Git. Keep imported binaries and account data out of source commits.

## Build

```powershell
npm ci
npm run prepare:game
node scripts/prepare-owned-singleplayer.cjs C:\path\to\reviewed-server-repository
npm start
```

The server importer reads immutable Git objects at its pinned commit, not the server checkout's working tree. It excludes accounts, saves and environment files. Inspect the pin in the importer before updating it.

Before large builds or test batches, run `npm run storage:check`. It reserves 20 GiB of free space, caps active artifacts plus test tools at 64 GiB, and allows at most 32 GiB of lossless cold staging archives in `artifacts/archived-stages`. Retained canonical releases are counted separately. A failed check stops the build.

Use `node scripts/stage-release.cjs` when a game runtime may be active. It copies Git-listed source and runtime files, shares dependency/tool directories through junctions, and records the stage in `.test-tools/release-stage.json`. Reuse that stage for the version. Nested stages and a second stage for the same version are rejected. Source preparation must use current adapters.

After a verified release, keep one canonical copy of each old release and the small test evidence. Remove redundant downloads, packaged fixture copies and disposable build caches only after verifying retained copies and checking for active processes. Do not copy historical artifacts or caches into a new stage. Signing removes its temporary payload even when it fails.

`npm test` runs files serially with a 768 MiB V8 heap limit and a per-test timeout. Keep direct diagnostics within that limit too. Stream large files and compare hashes or changed offsets instead of formatting entire buffers on assertion failures.

## Code style

```powershell
npm run format
npm run format:check
npm test
```

Prettier formats JavaScript sources, scripts and tests. Pinned adapter JSON, binary deltas and imported assets are excluded. Explain non-obvious constraints in comments; routine control flow belongs in readable code. Keep setup instructions, architecture, compatibility evidence and test results in their respective documents.

## Release

1. Choose a semantic version and synchronize package.json, package-lock.json and src/legacy/package.json. Maintenance and documentation use a patch bump.
2. Build and test in staging. Follow [the test matrix](TESTING.md) for affected paths.
3. Run `npm run package`, `npm run release:sign` and `npm run installer` there. Verify the package, production fuses, signed updater and independent installer.
4. Commit the reviewed source and push. Create a draft release targeting the full commit SHA, with the explicit Setup EXE, its checksum, portable ZIP, its checksum and signed update manifest.
5. Download the draft assets, compare hashes and verify the pinned signature and manifest. Publish, then repeat the remote checks.
6. Preserve previous canonical executables and installers inside the repository before promotion. Keep installers in versioned release directories and on GitHub; never copy standalone installers or their backups to Downloads. Daniel uses the installed client's updater. Never update an active game or another agent's installation.

Existing signing scripts read the private key without printing it. Keep release tags and signed assets fixed once published. Rewriting main's commit messages changes commit IDs; retain a verified Git bundle and use an explicit force-with-lease against the previously inspected remote head.

## Documentation

- [Architecture](ARCHITECTURE.md): process boundaries and remaining design debt.
- [Compatibility](MINESA-UPDATES.md): reviewing upstream changes.
- [Client features](CLIENT-FEATURES.md): current presentation and control behavior.
- [Testing](TESTING.md): repeatable checks and their limits.
- [Security](../SECURITY.md): trust and update boundaries.
