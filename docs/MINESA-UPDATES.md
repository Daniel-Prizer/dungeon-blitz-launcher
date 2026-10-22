# Client compatibility

## Deployment status

The last fully reviewed GPU deployment is **swf-e20d49253050**, 978,778 bytes:

```text
c0abc2eac96a102b3be0246e8d3b83342bfe29e45e2c0a62e1942a051b485294
```

On 21 October at 16:14 UTC, both official origins served **swf-82cb959b0047**, 981,633 bytes, SHA-256 `7ac0aee9a35c39ef95d05105e52a9eb9af922b5762e9f09e129720dd3d50f9e4`. The existing complete Original contract accepts it; the exact-source GPU guard rejects it and restores Original. GPU adaptation for those new bytes requires a separate review.

All 73 artwork assets matched at the preceding reviewed deployment. Exact layouts and reusable recipes live in src/legacy; GPU recipes and artwork hashes live in src/gpu. The separate local-client contract is restricted to the selected loopback origin. Deployment evidence is not permission to accept future hashes.

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

## GPU admission

GPU mode verifies exact source bytes or byte-identical recompression and all loaded SWF artwork. The reviewed writer inventory covers 395 sites in 99 methods; unrelated native envelopes and exception tables remain intact. The Flash page changes only its unique reviewed wmode parameter to transparent.

Collection, decoding and interpolation are presentation work. Keep native clocks and animation poses unchanged. The worker allows two GPU fences in flight and bounded artwork memory. Unsupported/stale scenes restore Original. Native shutdown drains active work and lets the worker close itself; an unacknowledged close disables retries until reconnect. After warmup, sustained capture above 12 ms or synchronous bridge reads above 50 ms trigger a 30-second backoff.

## Verify and release

Follow [the test matrix](TESTING.md). Exercise real native artwork, input, camera, map, transitions, fullscreen, density changes and unknown-client fallback. Review owned screenshots; report account-free or inactive-desktop limits accurately.

For a release, synchronize versions, package in staging, retain production integrity fuses, sign and verify all physical files, then test the packaged updater and installer. [Development](DEVELOPMENT.md) describes publication. Keep old builds, the local version hold and update opt-out. Never interrupt a running game or install into an agent-owned copy.

Historical review notes remain in Git at the corresponding release tags.

## Native 120 FPS admission

The native player is qualified separately for **swf-eedde5fc22be**, 983,395 bytes, SHA-256 `c0ef52751ab04c696cff2c93f2cddfbf61323124c4e18fc6f1151fd91126994d`. The complete Original contract produces enhanced SHA-256 `874171b528c3850b9fa17d6365f64cdc3ff94e843c0579627ee82999008d2532`. Admission verifies the 52 master-list SWFs and 21 separately requested level libraries on both official origins.

The 0.31.1 resource fix includes the level libraries, which are absent from `masterFileList.xml`. Two current level files contain the same dialogue spelling correction; their other tags, constant pools, class contracts and all raw method bodies/exception tables are unchanged. [Level review](../research/native-player/level-resources.json) records the hashes and comparison. Unknown files and changed bytes still fail admission.

Admission checks both hashes, the complete adapter contract, the exact SWF inventory and every artwork hash. A source or helper change needs fresh native qualification. Failure restores Original and preserves preferences. This does not approve the same deployment for the separate retained GPU world adapter.

The pinned native fork supports the current class-only placements and inherited symbols. Its vector extraction matches 18 Flash reference cases, including repeated reads of authored shapes without erasing them. Automatic timelines retain the effective 60/s ceiling while frame callbacks and rendering may run at 120/s. Original elapsed-time game methods, packet code, dungeon/session behavior and loot logic remain unchanged. See [native build and qualification](../research/native-player/README.md).
