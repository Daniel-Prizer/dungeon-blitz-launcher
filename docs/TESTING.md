# Testing

## Automated checks

```powershell
npm run format:check
npm test
node scripts/test-modern-ui.cjs
```

Unit tests cover settings, input policy, links, adapters, scene/resource validation, updater safety and local-server lifecycle. UI tests cover draft/Save/Discard behavior, keyboard navigation and Settings at 800×600 and 1440×900.

Native tests require the imported runtime and reviewed fixtures. Use the guarded inactive desktop, not the input desktop. Run camera, transition, native input/display, fullscreen and backdrop suites when those paths change. Inspect owned screenshots before claiming a visual pass. Test controls and counter-rate overrides must stay in disposable fixtures.

## Independent fixtures

A production-named game executable can trigger a running farmer's process guard. While another game/agent is active, use genuine independently packaged fixtures rather than renaming a production EXE. Never restart or close someone else's session for a test.

- `test-owned-singleplayer-native.cjs --gpu --multiplayer`: anonymous native GPU startup and actual client/helper integration.
- `research-native-gpu-performance.cjs --60`: original-artwork/HUD fixture, source/native/render rates, GPU pixels, caps, resize and interrupted shutdown. The stage-rate flag is fixture-only.
- `test-compatible-native-suites.cjs <fixture.exe>`: existing camera/map and transition/terrain/menu suites through the independent shared host.
- `test-packaged-singleplayer.cjs`: actual packaged utility/server lifecycle, artwork, normal stop/restart and production archive-integrity positive/negative controls.
- `test-updater-electron.cjs --packaged --isolated-fixture`: packaged updater module, signatures, physical ASAR hashes, progress, tamper rejection, cleanup and rollback.
- `test-installer.cjs --isolated-fixture`: fresh/repeat install, registration, real shortcut files, busy-process refusal, path rejection, newer-build retention, signed rollback and managed uninstall.
- `test-previous-updater.cjs <signed-manifest> <retained-shim>`: complete new payload through an older signed native updater.

Run the updater fixture before the installer fixture. Test installations and their desktop helper use physical paths; native junction protection and Inno's redirection guard remain enabled. Test installers use a separate registration identity and shortcuts inside their own disposable folder.

For a new unsupported multiplayer source, add `--expect-native-fallback=<observed-sha256>` to the native GPU title check. It asserts source rejection and working Original integration; it does not approve that hash for GPU adaptation.

## Coverage and limits

The 0.30.1 cleanup passes 100 unit groups, Settings UI, the native GPU artwork fixture, packaged singleplayer, packaged updater and independent installer. The retained signed 0.28 helper also installs and verifies the complete new payload. Formatting was checked against normalized syntax trees. Native/AS3 helpers, adapter data and bytecode recipes are unchanged. The earlier camera/map and transition baselines passed 121 and 134 samples respectively.

The native GPU fixture covers nine pixel/resource checks, five restarts, resize recovery and shutdown during an outstanding upload. Fresh anonymous integration verifies Original fallback on the newer public client; see [deployment status](MINESA-UPDATES.md#deployment-status).

Its final RTX 4080 SUPER run measured about 59.4 native updates/s, 24.5 source snapshots/s and 396.4 interpolated world renders/s. At a 240 ceiling it completed 191.1 world renders/s. These are account-free fixture results, not live-combat or whole-game FPS measurements. The earlier 426 figure also counted world rendering only.

Cursor tests never call ClipCursor or alter shared OS input. Fake APIs test accessibility policy without changing system settings. Inactive-desktop tests cannot verify Explorer/taskbar behavior. Anonymous startup cannot establish authenticated gameplay, all dungeon effects or long-session performance.
