# Native player

High FPS uses Ruffle v0.7.1 at `89a7049965f3090e706265670df309a5128233ac`, with the accompanying patch. Original Flash remains the default and fallback.

The patch adds class-only placement and inherited-symbol handling, non-mutating `Graphics.readGraphicsData`, separate presentation/timeline clocks, and the restricted launcher bridge/resource policy. The bridge applies custom cursors, density and caps on Save and restores settings when Game changes. It does not replay input actions. Private fixture controls require an inactive desktop and are absent from the production child environment. No game-account state belongs here.

Version 0.32.0 skips unused desktop-editor UI work in hosted mode, preserves child-filter caches in offscreen draws, and clamps the final audio mix. Render density changes the native viewport transform rather than the requested movie clock. The rolling FPS average counts completed renders, not just callbacks. Internal bridge/runtime identifiers retain their earlier `120` spelling for compatibility.

## Build

1. Clone [Ruffle](https://github.com/ruffle-rs/ruffle) and check out the exact commit above.
2. Apply `ruffle.patch` with `git apply --binary`. Retain the upstream license notices.
3. Use Rust 1.99.1 for `x86_64-pc-windows-gnullvm` and LLVM-MinGW 20261020 UCRT x64. The portable toolchain belongs in ignored tooling, never in an installed game copy.
4. Build `cargo build --locked -p ruffle_desktop --profile dist --no-default-features --features lzma`. The distribution profile enables LTO and one code-generation unit; the ordinary release profile did not meet the 1440p performance gate.
5. Qualify the distribution containing `BlitzNativePlayer.exe`, LLVM `libunwind.dll` and the notices listed in `build.json`. Import it with `node scripts/prepare-native-player.cjs <verified-distribution-directory> <runtime/native-player>`. The locked record verifies its hashes and source patch before copying. A fresh rebuild requires the qualification gates and an updated build record; hashes are not auto-approved. Package from staging.

The imported directory contains the runtime, upstream Ruffle/third-party notices, LLVM notices and build provenance. The patch and pinned commit make the modified source available; dependency versions remain in the patched Cargo lockfile.

## Qualification

Native admission is separate from the Original adapter contract. A reviewed source hash alone is insufficient: the complete adapter, exact SWF inventory and every artwork hash must also pass. Never add a future hash merely to dismiss fallback.

The public master list contains 52 SWFs. The game requests another 21 level libraries separately; these have their own exact inventory and reviewed paths. Both sets pass the same bounded download and hash checks before launch. All 73 current libraries are AS3, without legacy action tags.

The changing-artwork fixture must complete at least 118 GPU renders/s at the 120 target after warmup. Preserve effective 60/s automatic timelines, requested Stage rate, original 24-step elapsed-time integration and timer cadence. Native frame callbacks, GPU completion and physical scanout are distinct measurements.

Use the guarded inactive desktop, synthetic storage and TCP-denied public startup. Check authored vectors against Flash references, input and rebinding, blur/hide, window sizing/hit tests, UI, audio helpers, normal shutdown and packaging. Account-free fixtures do not establish live combat, server behavior or monitor scanout.

## Performance

The cap is adjustable from 30 to 1000, defaulting to 240. It limits rendering without promising that throughput. At 2560×1440 with widescreen enabled, the original dungeon-artwork/HUD fixture completed 145.81 renders/s at full raster resolution. At 75% resolution and a 240 cap it completed 166.46/s, with a measured 30-second average of 165.84/s. Each run measured 20 seconds after warmup on the RTX 4080 SUPER test PC. A changing marker and GPU texture capture distinguish fresh renders from duplicate submissions.

Elapsed-time integration retained 24 steps/s and 100-ms timers fired 200 times in 20 seconds. Automatic movie timelines remain about 60/s at a 240 presentation cap. This fixture has real artwork and HUD with synthetic activity; live combat and long sessions remain unmeasured. External PresentMon capture required unavailable ETW privileges, so monitor scanout and NVIDIA overlay compatibility are unverified. Sustained 240 FPS was not achieved in this widescreen scene.
