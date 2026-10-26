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
- `test-packaged-native.cjs`: actual packaged native resource module under production fuses, public asset admission, authenticated dungeon reads and rejected unknown/unauthenticated reads.
- `test-updater-electron.cjs --packaged --isolated-fixture`: packaged updater module, signatures, physical ASAR hashes, progress, tamper rejection, cleanup and rollback.
- `test-installer.cjs --isolated-fixture`: fresh/repeat install, registration, real shortcut files, busy-process refusal, path rejection, newer-build retention, signed rollback and managed uninstall.
- `test-previous-updater.cjs <signed-manifest> <retained-shim>`: complete new payload through an older signed native updater.

Run the updater fixture before the installer fixture. Test installations and their desktop helper use physical paths; native junction protection and Inno's redirection guard remain enabled. Test installers use a separate registration identity and shortcuts inside their own disposable folder.

For a new unsupported multiplayer source, add `--expect-native-fallback=<observed-sha256>` to the native GPU title check. It asserts source rejection and working Original integration; it does not approve that hash for GPU adaptation.

## High FPS qualification

The release record in [native-player/qualification.json](../research/native-player/qualification.json) binds the tested source, native binary, patch, adapters and evidence. Keep the anonymous startup gate at 118–123 completed renders/s for a 120 cap. A higher configurable ceiling does not replace that baseline check.

The widescreen dungeon-artwork/HUD fixture at 2560×1440 completes about 146 renders/s at full resolution and 166/s at 75% resolution. It measures 20 seconds after warmup, changing marker pixels and actual GPU completion. Original integration stays at 24 steps/s; the 100-ms timer fires 200 times. Automatic timeline checks preserve about 60 poses/s independently of 240 presentation callbacks. See [performance and limits](../research/native-player/README.md#performance).

Additional native fixtures:

- `test-native-player-settings.cjs <stub.swf> <ruffle_desktop.exe>`: all cursor styles and exact pixels/hotspots, native text cursor, live Save, three Game replacements, raster density/cap changes, tutorial width and restored widescreen.
- `test-native-autorun.cjs <stub.swf> <ruffle_desktop.exe>`: both directions, rebound movement, map open/close, stage deactivation, paired release and typing/forge/leave guards. Uses the original key manager/release with a synthetic held-command sink.
- `test-native-current-art.cjs <stub.swf> <ruffle_desktop.exe> <reviewed-art-folder>`: six October 26 map/room assets, exact hashes, native display construction and an owned GPU capture.
- `test-native-game-cursor.cjs <stub.swf> <ruffle_desktop.exe>`: all 16 current game cursors through the original registration method, copied RGBA/hotspots, animation, disposed source bitmaps, invalid dimensions, unregister and text fallback. OS cursor application stays in dry-run mode.
- `test-refresh-controls.cjs <stub.swf> <ruffle_desktop.exe>`: cached/list character selection, mismatch/missing/duplicate cancellation, manual input, dead/alive/typing/hidden/cooldown and held Enter. Only fixture authentication/packet callbacks are stubbed.
- `test-native-media.cjs --stub=<stub.swf>`: seven real ability icons, five filter/mask/density probes and four map-mask checks when the current helper is present. `--flash` constructs an independent reference. The four map-mask results match; four existing filter probes differ, so do not claim full filter parity. Eight October 25 helper checks cover packet pass-through, disconnected request refusal, clocks and unrelated input without sending packets.

The offline stub must derive from the exact admitted enhanced client and only suppress constructors that would start authentication. Both public origins are also tested with the real client, empty memory storage and denied TCP. Resource checks verify 73 SWFs; MP3 checks cover a real public file, format validation, authentication, unknown paths and traversal rejection. Audio playback fixtures compare native sound durations with Flash and check clipping with eight overlapping effects.

Audio repair qualification also compares owned CPAL PCM with decoded Flash reference clips, checking waveform alignment and missing audio windows. Callback timing is measured separately because correct PCM can still stutter when delivery is late. The fade fixture exercises the original SoundManager stream loop at 60 and 240 FPS. These are pre-device measurements; they do not establish listening quality at the speakers.

Camera/map, transition/terrain, native window bridge, production archive integrity, packaged resources, singleplayer, signed updating and independent installer remain release gates. Refresh/revive dependency review covers raw ABC instructions and exception tables, preserving all twelve original method envelopes. Minesa's TouchBridge cleanup and ScreenRepaint remain intact.

## Limits

Cursor tests use dry-run application and never call ClipCursor or alter shared input. Audio fixtures mute only their own process-tree session on an inactive desktop. No endpoint volume changes, accounts or live games are used. These tests do not establish authenticated combat performance, all dungeon effects, listening quality, Explorer behavior or physical monitor scanout. The retired worker's historical 426 figure counted world rendering only and is not a whole-game FPS result.
