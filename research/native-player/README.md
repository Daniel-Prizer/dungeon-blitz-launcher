# Native player

The optional 120 FPS player uses Ruffle v0.7.1 at `89a7049965f3090e706265670df309a5128233ac`, with the accompanying patch. It keeps the original Flash player as the default and fallback.

The patch adds class-only placement and inherited-symbol handling, non-mutating `Graphics.readGraphicsData`, a separate automatic timeline clock, the restricted launcher bridge and resource policy. Private fixture controls require an inactive test desktop and are absent from the launcher's production child environment. No game-account state belongs here.

## Build

1. Clone [Ruffle](https://github.com/ruffle-rs/ruffle) and check out the exact commit above.
2. Apply `ruffle.patch` with `git apply --binary`. Retain the upstream license notices.
3. Use Rust 1.99.1 for `x86_64-pc-windows-gnullvm` and LLVM-MinGW 20261020 UCRT x64. The portable toolchain belongs in ignored tooling, never in an installed game copy.
4. Build `cargo build --locked -p ruffle_desktop --profile dist --no-default-features --features lzma`. The distribution profile enables LTO and one code-generation unit; the ordinary release profile did not meet the 1440p performance gate.
5. Qualify the distribution containing `BlitzNativePlayer.exe`, LLVM `libunwind.dll` and the notices listed in `build.json`. Import it with `node scripts/prepare-native-player.cjs <verified-distribution-directory> <runtime/native-player>`. The locked record verifies its hashes and source patch before copying. A fresh rebuild requires the qualification gates and an updated build record; hashes are not auto-approved. Package from staging.

The imported directory contains the runtime, upstream Ruffle/third-party notices, LLVM notices and build provenance. The patch and pinned commit make the modified source available; dependency versions remain in the patched Cargo lockfile.

## Qualification

Native admission is separate from the Original adapter contract. A reviewed source hash alone is insufficient: the complete adapter, exact SWF inventory and every artwork hash must also pass. Never add a future hash merely to dismiss fallback.

The changing-artwork fixture must complete at least 118 GPU renders/s at the 120 target after warmup. Preserve effective 60/s automatic timelines, requested Stage rate, original 24-step elapsed-time integration and timer cadence. Native frame callbacks, GPU completion and physical scanout are distinct measurements.

Use the guarded inactive desktop, synthetic storage and TCP-denied public startup. Check authored vectors against Flash references, input and rebinding, blur/hide, window sizing/hit tests, UI, audio helpers, normal shutdown and packaging. Account-free fixtures do not establish live combat, server behavior or monitor scanout.
