# Widescreen

Widescreen extends horizontal presentation while keeping the original world height and artwork proportions. It is optional. The centered camera and centered hotbar settings are independent.

## Geometry

Use the game's original a_EdgeHud vectors with fixed-size corners and sides. Extend only the horizontal middle. Passive HUD artwork is cached on one pixel grid with adjacent integer clips; fractional scrollRects introduce seams. Preserve the original health, power, ability, companion, chat, quest and utility proportions.

Shared world/UI roots keep their native origin. Registered screens, independently attached panels and mixed utility children need individual anchors. Inspect both screen collections and deduplicate by identity. Bound matte traversal to passive full-view Shape/Bitmap leaves, account for parent scale and restore only geometry not superseded by the game.

Decorative vector clones freeze nested timelines. Widen the map hit shape without stretching its text or tooltip. Do not clip a Home world canvas to conceal missing art or players.

## Camera and terrain

Centered camera replaces only the reviewed horizontal target clamps with a 44–56% central band. Original room rays, floor offsets, smoothing, scripted and frozen paths remain. Disabling it must reproduce the original sample sequence. A missed widened side-floor sample cannot override the valid floor under the player.

Terrain coverage uses six even half-tile columns, matching the allocator's rounded dimensions. Preserve the protected visible/prefetch ring so tied cache timestamps do not evict a visible tile. Do not change cache clocks or replace native drawing with a test bitmap.

Backdrop density is bounded before raster allocation. Retain the original allocation limits, fallback and catch while preserving full art bounds and inverse display scale. The Tyrant cavern layers are a required regression case.

## Travel and menus

Keep the widescreen frame through Login, None and Transfer, including a pending second Game. Loading artwork receives its horizontal centering offset without scaling the logo. Use original three-slice HUD decoration and native modal mattes. Map raster, masks, polygons and highlights use the authored panel width; native clicks must align with the image.

## Limits and tests

Room bounds include collision and marker objects; they are not proof of continuous vertical art. Vertical expansion remains withheld. Some maps can expose unfinished scenery, and fixed-width overlays need individual review.

Verify 1080p/1440p, original restoration, direction changes, jumps, teleports, scripted cameras, map input, density changes and travel phases. Use actual class_23/Game drawing, stable cache identity and original level/HUD assets. See [testing](TESTING.md) and [compatibility](MINESA-UPDATES.md).
