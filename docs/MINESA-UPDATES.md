# Diagnosing and adapting to Minesa updates

Read this before treating a new rendering, input, sound or launch failure as a launcher regression. Minesa develops its live client privately. This repository and the archived server/client sources are not the authority for the currently served game.

## First establish what changed

1. Record the launcher version, symptom, saved display settings and whether the game worked before the latest Minesa deployment. Do not delete the player's profile or reinstall repeatedly as a diagnostic step.
2. Obtain the current public loading page and the SWF URL it actually references. Record the URL, `clientrev`, date and SHA-256 of the downloaded bytes. A query-string revision is not sufficient evidence of unchanged bytes. Use a disposable profile/cache so an older cached client cannot mask the deployment.
3. Compare that hash with `src/legacy/client-layout*.json`. Those files pin exact-revision adapters. From 0.19.0, also check the reusable structural contract: an unlisted hash can be compatible without a new release. In a guarded private test, inspect `clientIntegration`, `audioIntegration`, test-only `testAdapterMode` and `BlitzRenderState` if available. `client-deployment.json` records the freshly tested deployment, not an automatic authorization list. Never decode, log or publish account/session files.
4. If both the structural contract and exact-revision adapters reject the source, expect the unmodified game with a compatibility notice. Saved enhanced-rendering, widescreen, sound mix and mount settings are retained for a future compatible release. Do not remove checks, reuse whole-file offsets or claim that these enhancements still work.
5. If the hash is known, check asset changes too: Minesa can replace `UI_*.swf` and level art independently. Inspect the actual loaded symbol names, native bounds, timeline state and cache geometry. Level artwork may live in a loader's child ApplicationDomain; resolve through `ResourceManager.const_40[level.levelFileName]`, as the native game does, and test that domain boundary. A familiar SWF hash does not prove that every UI asset is unchanged.
   On-demand menus such as `ScreenStoreFront` may appear only in `mActiveScreens`, without entering `var_1240`. Review both collections, deduplicate by screen identity, and anchor individual roots. For independently attached legacy panels, use their persistent body rather than hidden popup/tab bounds; do not move the shared world root or alter an already-correct book panel.
6. Separate launcher faults from game faults using the same live revision with enhancements disabled. If unmodified loading fails too, inspect page parsing, allowed origins, asset requests, socket reachability and the game server. A clean original layout is a diagnostic comparison, not proof that custom widescreen is fixed.

## What can remain enabled

The native launcher window, settings storage, fullscreen, cursor-lock policy, master process volume, installer, signed updater and external-link routing do not depend on game bytecode offsets. They can usually survive a game-client update. Page/origin or network changes can still affect launching and link routing.

Native raster sizing, 16:9 world/HUD layout, category sound routing, FPS instrumentation, focus-splash removal and Shift mounting use reviewed client helpers. From 0.19.0 those existing hooks may be reused on another revision that matches the structural contract below. A changed hook or interface still needs review. Decorations belong to those helpers too. Asset-only changes may affect presentation even when game code is unchanged.

## Automatic reuse of reviewed hooks

`scripts/prepare-adaptive.cjs` extracts a local recipe from the independently compiled October 11 adapter. Its source remains pinned to `6ef9fcfc5514d5ffa9a5ef1fd008eaccbfcabf2051d2dd31a3a4629500837366`. The recipe is included in the signed application payload; no game page supplies recipes or replacement instructions. Java/JPEXS remain build tools and never run on a player's machine.

The runtime's bounded SWF/ABC reader locates the main script structurally. It verifies the original pool entries, complete semantic class/method/script interfaces, stage preamble and root bindings. Equivalent duplicate symbols and legal alternative integer encodings are accounted for. Extra constants/symbols are preserved. All 28 edited method envelopes and six input/transition dependency envelopes must match their reviewed hashes. Only their existing compiled deltas and four launcher-owned helper tags are added; every unrelated fetched body/tag remains intact.

JPEXS records 108 exact appended-constant operand boundaries at build time. Runtime relocation moves only those references around Minesa's appended symbols. A changed encoded width rejects the contract rather than guessing new branch/exception offsets. The result is parsed again and every retained/replaced body is verified. All four older exact-revision adapters remain available as fallbacks.

The newer deployment `swf-5f935c2e6795`, SHA-256 `583433640586d15fabaaf7ec35d5b7d0193efe106789256e2e7ed84b024e7f7f`, is accepted by that preceding recipe without its own exact-revision adapter. Its 12 changed social methods, two appended strings and 18 appended multinames are preserved. Tests verify the relocated helper symbols and the freshly served client in actual Flash.

This handles compatible code-body changes and appended symbols; it does not autonomously understand changed field types, inserted/reordered method tables, altered hook bodies, changed original constants, or incompatible asset geometry. The current helper bundle is atomic, so a failed contract disables that bundle; shell settings, master volume, window controls and signed updating remain independent. Unknown behavior in an unchanged interface can still cause a presentation regression. When that happens, compare with enhancements disabled and review the relevant callers/assets instead of loosening contracts.

The custom Dragon Ore counter is not shipped. Reintroducing it requires a native icon, complete currency frame and matching embedded font, plus detection of a native replacement; do not revive the cropped Gold backing or environmental ore doodad.

## Review a new revision

1. Preserve the original download in ignored local tooling and establish its hash. Export only relevant classes with the pinned JPEXS tool. Review changed methods and their callers against the last reviewed client.
2. Re-derive layout and focus metadata in `client-layout*.json`; inspect branch targets, local counts, exceptions, ABC lengths and bounds. Never change metadata just to make a failing build pass.
3. Review `DisplayPatchBuilder.java`, `AudioPatchBuilder.java`, `BlitzDisplay.as` and `BlitzInput.as`. Pin the newly reviewed method hashes. Verify every original method outside the explicit presentation/audio hooks remains unchanged, including authentication, packets, input/keymaps, cooldowns and simulation.
4. Preserve independent functionality. Do not move launcher settings into game code or introduce whole-screen capture/upscaling just to recover one presentation feature. Use current native artwork, fixed-size corners, measured child bounds and read-only game state; avoid depending on translated parent roots or saved screenshots. Verify asset contracts before using an updated symbol.
5. Build adapters with `npm run prepare:game`. The helper delta is verified by full reconstructed-output hashes and bounded operations. Review generated changes; imported Adobe/game binaries, test profiles and private captures must remain untracked.

## Required verification before release

- Run `npm test`, `npm run test:transition` and `npm run test:native`. Run focused rendering/input/FPS/margin checks when those paths changed. Check the actual rendered results, not just successful callbacks or percentages.
- Test original and widescreen modes at 1080p and 1440p: equal margins, original corner art, native ability/XP backing, companion icons, map/quest row, social count, talent slot, currencies, menus and matte coverage. Check movement at both camera directions, native cache reuse, labels, room art, interiors and all travel phases, including pending second games and Login/None/Transfer states. Ensure gameplay clocks remain unchanged.
- Use the guarded inactive desktop and own-process input/captures. Never switch desktops, touch Daniel's mouse/keyboard/clipboard, or operate his visible game. Cursor tests dry-run OS confinement. The inactive desktop lacks Explorer, so it cannot visually establish taskbar behavior.
- An authenticated test needs explicit account/character authorization. Avoid concurrent sessions, retain passwords only in game-owned storage, and remove the disposable copied profile after QA. If a character cannot enter an area, report fixture evidence and that limitation; do not claim a live visual pass.
- Exercise unknown-client fallback, preserved preferences and update opt-out. Compatibility failure may trigger one additional signed-update check per session; it must not interrupt gameplay or install an unverified payload.
- Package and test the signed updater and installer under actual Electron: `npm run package`, `npm run release:sign`, `npm run installer`, `npm run test:updater`, `npm run test:installer`. Follow `SECURITY.md`; never weaken manifest verification or read the signing key into logs.

Every committed change needs a semantic version bump, synchronized across root/lockfile and legacy package. Refresh the root runnable EXE and installer, then publish only source and verified release artifacts. Document the reviewed game hash, tests, visual evidence and remaining limits. A passing synthetic fixture alone is not a guarantee that all multiplayer content works.

## When no adaptation is required

A server/content update can leave the reviewed game code and UI contracts unchanged. Keep the existing helpers when fresh tests confirm compatibility; do not disable working features merely because a news announcement changed. Conversely, never call a bytecode-changing update compatible solely because its first login screen appears.

Flash and the embedded legacy engine are unsupported. Hash pinning protects compatibility, not future Flash vulnerabilities. Keep process isolation, narrow privileges, allowed origins and signed updates; no launcher change can promise immunity to a future runtime or operating-system exploit.
