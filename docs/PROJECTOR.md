# Projector migration: experimental, not shipped

The production launcher in 0.16.0 still uses the existing separate Electron 11 / Flash 32.0.0.363 host. The signed updater is a completed feature; the projector migration is not. Do not enable a weaker fallback or widen personal-data access to make a compatibility test pass.

## October 10 re-evaluation

The official launcher v1.2.0 pins Adobe projector 32.0.0.465 to the same SHA-256 used by this prototype: [official projector lock](https://github.com/db-preservation-contributors/dungeon-blitz-r-launcher/blob/v1.2.0/projector.lock.json). On Windows its [launch preparation](https://github.com/db-preservation-contributors/dungeon-blitz-r-launcher/blob/v1.2.0/lib/projector.js) returns the executable and remote SWF URL, and [main.js](https://github.com/db-preservation-contributors/dungeon-blitz-r-launcher/blob/v1.2.0/main.js) starts it using an ordinary child-process spawn. That specific launch path does not establish AppContainer containment. Its current Electron shell is separate from the game's standalone renderer.

Using that newer projector would remove Chromium 87 from the game-rendering path. It would not repair Flash or guarantee protection against future CVEs: [Adobe ended support and security updates](https://www.adobe.com/products/flashplayer/end-of-life-alternative.html). Switching without isolation would also expose the standalone player under the ordinary Windows user token. The fresh AppContainer SharedObject fixture still fails on this machine, using synthetic data only. Consequently this is not a safe, feature-complete replacement to ship yet; it remains excluded. Settings communication and a tiny internal render probe alone are insufficient evidence of game, storage, input and link compatibility.

## Implemented foundation

- Adobe projector 32.0.0.465 is downloaded from Adobe, hash-pinned to `a4b333ac1da12026989549015303d82231982838bccfb544ba5fd188746066f0`, and verified again by the native launcher before execution.
- `SandboxHost.cs` launches with explicit AppContainer security capabilities, child creation blocked, no inherited handles, a sanitized environment and a one-process, kill-on-close Job Object. It assigns the job before resuming the suspended child. There is no unsandboxed fallback.
- Only a scoped runtime directory and prototype data directory receive AppContainer ACLs. Tests use an inactive desktop with its own low-integrity/AppContainer ACL; the input desktop and WinSta0 permissions remain unchanged.
- Actual native tests verify the child token and deny access to a synthetic outside file, creation of another process and loopback connections. These are containment tests, not CVE exploitation tests or proof against Windows sandbox escapes.
- Owned minimal SWFs test a networking-only settings/movie bridge via isolated ApplicationDomains and LocalConnection. A local-with-filesystem wrapper cannot communicate with the networking movie, and `LoaderContext.parameters` belongs to AIR, so neither is used in the passing fixture. No global Flash trust setting is changed.
- Two distinct audio/zoom/FPS configurations reach the fixture; it draws and checks an internal bitmap pixel before exiting. This does not verify native window scanout, actual Minesa game zoom or the full launcher settings port.

## Remaining blockers

The isolated SharedObject test fails to create/flush a tiny synthetic save. Environment redirection changes the native probe's app-data path, but has not made Flash persistence work. Remembered sign-in cannot be claimed. Do not copy credentials into tests or grant access to all existing Macromedia/shared-object data. A packaged Win32 isolation/MSIX profile with filesystem/registry virtualization is a candidate to investigate; it is not implemented or installed.

The normal Internet capability is broad outbound access. Game-only destination enforcement requires a separately designed OS policy/broker; HTTP origin checks alone do not contain a compromised native Flash process. The no-Internet fixture proves loopback denial only. No WFP policy, firewall installation, LPAC migration or additional exploit mitigations have been validated.

Persistent sandbox identities and data must be partitioned by validated game origin. Caching different servers' SWFs under a common local URL can collapse Flash's storage origin; a single reusable AppContainer SID can also retain ACL access to earlier profiles. Do not let a newly selected server inherit another server's saved session. Any migration from the existing profile needs an explicit, scoped design and must never be tested with real saved credentials.

Full integration still needs revision-pinned game configuration/control adapters; durable isolated save data; master/category audio; rendering/resolution/zoom/input; cursor/menu/fullscreen; user-activated external links; URL changes; actual server asset/socket compatibility; and authenticated multiplayer testing without using a player's saved credentials. `NativeHost` remains an external trusted controller: do not inject/subclass the projector's foreign window thread.

## Reproduction

Use Windows, the existing Java/JPEXS test compiler and Node. `node scripts/prepare-projector.cjs` obtains the verified projector and compiles the helper/private-desktop test harness.

- `npm run test:projector` runs the owned settings/bitmap fixture on a guarded inactive desktop. It passes.
- `npm run test:projector:storage` adds SharedObject persistence. It currently fails and must remain a release gate.
- On the inactive desktop, `scripts/sandbox-test.cjs` runs the native containment fixture. It uses only a synthetic canary and a local listener; no personal data, passwords or actual clipboard content are read.

Imported projectors, SWFs, profiles, captures and diagnostics remain ignored. Package verification rejects the experimental projector runtime and research artifacts. Unsupported Adobe Flash remains a security risk even if the future migration succeeds.
