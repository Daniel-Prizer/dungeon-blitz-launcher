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

Use a fresh staging directory when a game runtime may be active. `node scripts/stage-release.cjs` copies source and runtime into an ignored workspace and records its path in `.test-tools/release-stage.json`. Source preparation must use current adapters; a stale runtime copy is not a substitute for rebuilding changed helpers.

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
6. Preserve previous canonical executables and installers before promotion. Never update an active game or another agent's installation.

Existing signing scripts read the private key without printing it. Keep release tags and signed assets fixed once published. Rewriting main's commit messages changes commit IDs; retain a verified Git bundle and use an explicit force-with-lease against the previously inspected remote head.

## Documentation

- [Architecture](ARCHITECTURE.md): process boundaries and remaining design debt.
- [Compatibility](MINESA-UPDATES.md): reviewing upstream changes.
- [Client features](CLIENT-FEATURES.md): current presentation and control behavior.
- [Testing](TESTING.md): repeatable checks and their limits.
- [Security](../SECURITY.md): trust and update boundaries.
