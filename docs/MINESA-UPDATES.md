# Client compatibility

## Deployment status

On 10 November, both official origins served **swf-22fa3fe7e30f**, 1,178,201 bytes, SHA-256 `27b6c770382783fa634d5a236c8fb632fde7a819c85ca58c9630320e0a5e22e7`. Patch 0.33.8 adds two exact reviewed presentation/audio envelopes for this client; native High FPS admission is qualified separately.

All 73 SWF assets were checked on both origins: 52 master-list assets and 21 level libraries. Seven changed since 0.33.7: Gfx_Paladin_1, Gfx_Rogue_1, LevelsJC, LevelsLD, LevelsLI05, LevelsOMM and UI_4. Their current AS3 structures and representative native artwork were reviewed; the original library bytes are retained without launcher edits. Exact layouts and reusable recipes live in src/legacy. The local-client contract remains restricted to the selected loopback origin. Deployment evidence is not permission to accept future hashes. The retained-world GPU adapter is research only.

The current upstream door-trigger correction, graphics recovery catches, map recovery and unrelated game methods must remain intact. The launcher does not change dungeon rejoining, loot awards, simulation or server behavior.

## Diagnose a change

1. Record the launcher version, symptom and relevant saved settings. Do not delete profiles or reinstall as a first diagnostic.
2. Fetch the public loading page and the SWF it actually references without authentication. Record the URL, clientrev, byte length and SHA-256. Use a disposable cache; query-string revisions alone are insufficient.
3. Check the fetched bytes against exact adapters and the complete reusable contract. A new hash can already be structurally compatible. A changed guarded method must fail until reviewed.
4. Inspect loaded UI/level assets too. Resolve level art through the loader's ApplicationDomain, as the native game does. Main-client compatibility does not prove unchanged artwork.
5. Compare the same revision with enhancements disabled. If original loading also fails, inspect page parsing, origin restrictions, asset requests and server reachability.

Unsupported adaptations retain the unmodified game and a compatibility note. They do not disable unrelated shell features. Saved preferences survive fallback.

## Review and reconstruction

Use the pinned JPEXS tools to compare actual changed classes, raw ABC instructions, callers and exception tables. Decompilation alone can hide relevant instruction/handler differences. Preserve original inputs locally in ignored tooling.

The reusable contract verifies original constant-pool prefixes, complete semantic interfaces, root bindings, stage geometry, edited method envelopes and their dependencies. Existing deltas relocate only build-reviewed appended-symbol operands without changing encoded widths. Reparse the output and verify every retained/replaced body. Never approve an unfamiliar hash, reuse whole-file offsets or relax guards to force success.

Maintain independent multiplayer and singleplayer contracts. Local endpoint relocation runs only after the complete local presentation contract passes. Import bundled server code from the pinned Git object; do not copy accounts, saves, environment files or working changes from a server checkout.

The original reusable recipe derives from the reviewed October 11 source, SHA-256 `6ef9fcfc5514d5ffa9a5ef1fd008eaccbfcabf2051d2dd31a3a4629500837366`. Later complete recipes preserve upstream transition, interface, crop, canvas and map recovery changes. Their source/body/dependency hashes in metadata are authoritative.

## Presentation contracts

| Area | Required invariant |
| --- | --- |
| Camera | Preserve floor rays, collision boundaries, smoothing and scripted/frozen paths. Centered follow changes only two reviewed horizontal clamp ranges; a missed side floor ray cannot beat a valid player-floor sample. |
| Transition/canvas | Preserve native allocation limits, catches and recovery. Keep the same frame through Login/None/Transfer, including a pending second Game. |
| Map | Raster, hit polygons and highlights use the authored 1152-pixel panel width. Redraw presentation without changing simulation clocks. |
| Terrain | Retain original tile sizes, budgets and clock behavior. Six even half-tile columns and the protected visible/prefetch ring prevent reuse gaps. |
| Backdrops | The class_82.method_193 hook bounds cache density while retaining 4,194,304-pixel/8191-side limits, inverse display size and allocation exceptions. Never invent replacement artwork. |
| HUD/menus | Keep shared world roots fixed. Anchor individual screens, mixed utility children and full-view passive mattes. Preserve twip rounding, native vector corners and bitmap budgets. |
| Input/audio | Retain original keymaps, native handlers, fades, packets and gameplay methods. Helpers use only reviewed own-stage bindings and sound contexts. |

## Verify and release

Follow [the test matrix](TESTING.md). Exercise real native artwork, input, camera, map, transitions, fullscreen, density changes and unknown-client fallback. Review owned screenshots; report account-free or inactive-desktop limits accurately.

For a release, synchronize versions, package in staging, retain production integrity fuses, sign and verify all physical files, then test the packaged updater and installer. [Development](DEVELOPMENT.md) describes publication. Keep old builds, the local version hold and update opt-out. Never interrupt a running game or install into an agent-owned copy.

Historical review notes remain in Git at the corresponding release tags.

## High FPS admission

The native player is qualified separately for this deployment. The complete Original contract produces enhanced SHA-256 `5447a4dc24896bc29512cc40f7ac3f6eb1f884955d2aece930d5a8d67b92dbe8`. Admission verifies both client hashes and every listed artwork hash on both official origins. Public MP3s use a separate exact-name allowlist and bounded format-checked cache.

The 0.31.2 compatibility update preserves Minesa's TouchBridge retention cleanup and new ScreenRepaint helper. That deployment prepends a three-instruction UI repaint call and adds its helper tag; the other 3,775 main method bodies and existing non-main tags are byte-identical to the preceding client. Review covered raw instructions, branches and both helper Error catches. The complete adapter retains the helper and its call. See the [deployment review](../research/native-player/deployments/2026-10-22.json).

The 0.31.1 resource fix includes the level libraries, which are absent from `masterFileList.xml`. Two current level files contain the same dialogue spelling correction; their other tags, constant pools, class contracts and all raw method bodies/exception tables are unchanged. [Level review](../research/native-player/level-resources.json) records the hashes and comparison. Unknown files and changed bytes still fail admission.

Source or helper changes need fresh native qualification. Failure restores Original and preserves preferences. No source guard was weakened for the configurable cap.

The pinned fork supports class-only placements, inherited symbols and non-mutating vector extraction. Offscreen bitmap draws retain the existing child-filter behavior; four synthetic filter probes differ from Flash, so full filter parity is not established. Mixing clips once after summing voices. Automatic timelines retain the effective 60/s ceiling while completed rendering uses its independent cap. Elapsed-time game methods, packet code, dungeon/session behavior and loot remain unchanged.

Refresh and Enter-to-revive add guards for the original selection, respawn and button-handler dependencies. Twelve native method envelopes and their exception tables remain byte-identical; [the control review](../research/native-player/session-controls.json) records their hashes. The helper calls the original handlers and preserves their authentication, enabled-state and cooldown checks. See [native qualification](../research/native-player/README.md).

The 0.32.1 audio correction gates the original fade loop at 60 Hz in the native player. Embedded Flash retains its existing callbacks. Its original loop instructions and exception data are retained; the other 3,775 game method bodies are unchanged from 0.32.0. Game cursor artwork now uses native `MouseCursorData` support without editing the client's cursor selection. [Audio and cursor review](../research/native-player/audio-cursor-review.json) records the comparison.

The 0.32.2 compatibility patch qualifies Minesa's AIR loading helper, Rankings navigation correction and BaseDamageMult fix. Raw instruction and exception review accounts for all four changed main bodies; the other 3,772 remain byte-identical. The existing adapter preserves all four changed bodies and every upstream helper. See [the October 23 review](../research/native-player/deployments/2026-10-23.json).

The 0.32.3 compatibility patch preserves Minesa's new map-mask drawing and non-interactive repaint cover. An exact map-refresh envelope variant retains the authored map width correction; older reviewed envelopes remain unchanged. Each method permits at most eight distinct, hash-checked replacements and rejects ambiguous or unfamiliar bytes. See [the October 24 review](../research/native-player/deployments/2026-10-24.json).

The 0.32.4 compatibility patch qualifies the October 25 guild raid, Neo quest, map teleport, loot-command and Sentinel changes. All nine changed main bodies and all 205 added helper bodies remain upstream code; the existing presentation recipe is unchanged. Raw branches and exception relocations were reviewed. See [the October 25 review](../research/native-player/deployments/2026-10-25.json).

The 0.33.0 update retains October 26 combat, loot-command and guild changes. A new exact `TakeDamage` envelope reapplies the three existing sound-owner wrappers while preserving the group-damage floater, branches and exception ranges. Other changed game methods and every upstream helper remain untouched. Autorun now permits the map without changing native movement handlers. Six earlier native admissions retain the same game code with only the updated launcher input helper. See [the October 26 review](../research/native-player/deployments/2026-10-26.json).

The 0.33.1 patch qualifies the October 27 combat, crafting and guild changes and October 28 enemy-armor adjustment. All changed game methods and both guild libraries remain byte-identical to upstream after adaptation. Refresh now uses an intercepted new-window request, preserving Flash's click gesture without navigating away or changing rendering detail. Eight earlier native admissions change only the launcher input helper. Native clocks and artwork pins are unchanged. See the [October 27](../research/native-player/deployments/2026-10-27.json) and [October 28](../research/native-player/deployments/2026-10-28.json) reviews.

The 0.33.3 patch supports the October 28 own-effects option and updated guild raid screens. A separate complete interface contract preserves the new checkbox, effect guards and closure. The existing sound-owner wrapper remains around its original call; previous contracts and singleplayer are unchanged. The UI_4 update adds the menu row without changing its ABC. See the [effects update review](../research/native-player/deployments/2026-10-28-effects.json).

The same patch also qualifies the later October 28 balance deployment. Its nine changed main methods and complete BalanceHooks tag remain upstream bytes; the effects contract needs no further change. See the [balance update review](../research/native-player/deployments/2026-10-28-balance.json).

The 0.33.4 patch qualifies the October 29 invitation persistence, guild-directory redraw, dead-player loot restriction and touch-chat updates. All five changed main bodies and all helper tags remain upstream bytes. The eight existing presentation recipes and native renderer are unchanged. See the [October 29 review](../research/native-player/deployments/2026-10-29.json).

The 0.33.5 patch qualifies the updated LevelsJC library. The Davan Longcut room now resumes from the server’s saved phase. Raw review accounts for two changed methods and three additions; the other 2,367 normalized methods and all artwork tags are unchanged. The complete upstream library is retained. Main-client hooks, native rendering and singleplayer remain unchanged. See the [October 30 review](../research/native-player/deployments/2026-10-30.json).

The 0.33.6 patch supports the November 2 client and six artwork updates. Its exact damage envelope retains the new incoming-damage hook and reapplies the three existing sound-owner wrappers. All other upstream methods and helper tags are preserved. The reviewed level libraries retain their server-authority phase snapshots and shared encounter randomness. Native rendering and the separate singleplayer contract are unchanged. See the [November 2 review](../research/native-player/deployments/2026-11-02.json).

The 0.33.7 patch supports the November 3 client. It preserves the combat floor-ray correction, disabled guild raid gate, explicit UI conversions and updated news-banner behavior. All 73 artwork files and existing presentation recipes are unchanged. The changed combat method and complete upstream helpers remain byte-identical after adaptation. See the [November 3 review](../research/native-player/deployments/2026-11-03.json).

The 0.33.8 patch supports the November 10 client. It preserves the upstream
DisciplinePassives.Damaged call, all three SoulthiefPassivePays conditions and
MapTeleport.Page selection. The existing three damage sound-owner wrappers and
1152-pixel map panel width are reapplied as separately pinned variants. The other
3,745 unhooked main bodies and all 54 upstream non-main tags remain byte-identical;
previous envelopes and the independent singleplayer contract remain supported.
Both official title clients passed anonymous native startup, completed-render
120-cap, resize and audio checks. See the [November 10 review](../research/native-player/deployments/2026-11-10.json).
