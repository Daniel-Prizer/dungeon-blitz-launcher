# Dungeon Blitz Launcher

Version **0.8.0** (minor: adds rolling low/high readings to the measured game FPS counter).

Run **Dungeon Blitz Launcher.exe** in this folder. The root executable always points to the latest packaged build. Keep the release folder beside it. No installer or administrator access is needed. Source stays in Downloads/BlitzBrowser; the historical folder name is retained.

The launcher automatically opens Minesa's live Dungeon Blitz in one isolated original Flash session. Tabs, address/search bar, homepage, bookmarks, history, downloads, browser navigation and the experimental Ruffle/socket bridge have been removed.

The game surface follows the launcher and cannot be dragged or resized separately. Its edges remain game input. Move and resize the launcher normally using its title bar and outer window frame.

The windowed title bar is 32px high and uses a muted Dungeon Blitz wordmark, with no ready/status label. A matching DB monogram supplies the Windows icon.

A small FPS counter sits in the upper-left gray margin. It counts the actual game-loop Flash frame events over elapsed milliseconds and updates about once a second. Low and High show the smallest and largest measured averages whose samples ended within the last 30 seconds; these are not 1% lows or individual frame times. It accepts no mouse/keyboard focus, so clicks still reach the game. It hides when zoom leaves no side margin. The number is game frame cadence, not the configured target, monitor refresh, network latency or measured GPU scanout.

Game links on the selected game origin reload the configured game page. User-activated external HTTP/HTTPS links open in your default browser, never inside the Flash host. Privileged schemes and credential-bearing URLs are blocked; unsolicited external popups are denied.

## Settings

- Master: 0–100 in steps of 1; fresh profiles start at 100. Zero silences game audio. Controls only Windows audio sessions belonging to the game and its child processes; leaves device/master volume and other apps alone. The game's own sound controls still apply. New audio sessions and active output devices are checked every second.
- Player, Music, Environment and Creatures: independent 0–100 sliders in steps of 1, all defaulting to 100. Player covers player characters/abilities and menu sounds; Creatures covers non-player entity sounds; Environment covers ambient streams and room/world sounds. Classification uses the emitting entity, not guessed sound names. Category gain multiplies the game's own volume and Master. Existing channels and loops update without reconnecting; music/ambient fade timing remains unchanged. Separate categories require the reviewed Minesa client; unsupported revisions disable those sliders while Master still works. Flash can quantize a composed channel gain to a 1% step.
- Lock cursor inside the window: off by default. Windowed confinement includes the top menu, so Settings and Fullscreen remain reachable. Sides and bottom retain a 12-logical-pixel inset, scaled for DPI; fullscreen applies that inset to every game edge. Settings, minimisation, switching apps and close release confinement. Left Alt by itself toggles between unlocked and locked; Alt+Tab and Alt+F4 remain normal Windows shortcuts. Click the shortcut button and press a single key to record it; Escape cancels, and F11 remains reserved for fullscreen. Modifier keys toggle on release so normal keyboard chords remain available. The settings button can also suspend/re-enable locking. An unlocked session stays unlocked until toggled again.
- Game URL: defaults to https://dungeonblitzr.theminesa.studio/. Accepts HTTPS pages and HTTP on localhost/127.0.0.1/[::1]. Credentials and privileged URL schemes are rejected. Save the URL, then use Apply URL & reconnect. An address edit never silently interrupts gameplay. The isolated runtime's HTTP access is restricted to that selected origin; pages requiring resources on another origin may not work.
- Game scale: Fit entire game, or 50–300%. Larger-than-Fit views crop edges. The reviewed Minesa client redraws its own game bitmap at the requested size inside a full-window Flash stage. Normal 1080p/1440p rendering does not enlarge a fixed low-resolution bitmap in Chromium. Windows DPI is compensated in the host; exceptionally large zooms use a bounded 4096×2730 layout budget with residual browser scaling. Margin clicks preserve focus and pass native aiming and attack events to the game. The Lost Focus splash is removed; normal focus and key cleanup remain.
- Graphics acceleration requires a launcher restart. Background activity can be disabled.
- Rendering resolution: 100% is the default and retains the sharp native rendering. 75% and 50% reduce the game's backing bitmap while keeping the displayed picture size and normal animation speed. They draw approximately 44% and 75% fewer pixels, respectively, with softer enlargement. This can reduce CPU raster work when a Flash thread is busy; it is not a guaranteed combat FPS improvement. The FPS counter keeps its on-screen size. Unknown client revisions disable this setting.

The dedicated game host disables legacy Chromium native-window occlusion heuristics to avoid incorrectly treating its separate game surface as covered. Explicit background settings remain available. This is a potential client-stall mitigation; the reported delayed NPC interactions have not been reproduced or established as resolved. Fullscreen notifications now follow actual visibility changes and are refreshed on game activation. The isolated tests verify native state, but cannot visually verify Explorer taskbar behavior.

The game uses original native Flash rendering. Neural enhancement, comparison and FPS target controls are removed; saved experimental graphics preferences are discarded. The new FPS counter is observational. Game scale remains available and animation timing is unchanged. The display adapter reuses the original cache-invalidation/resize path; it changes neither game clocks nor multiplayer state. Graphics acceleration is now forwarded to the separate game host as well as the local shell.

F11 toggles fullscreen. Escape exits fullscreen. Ctrl+, opens settings even while the game has focus. Fullscreen has no title/exit strip. Closing and reconnecting do not show leave-game confirmations.

Your existing original Flash sign-in profile is retained. Old browser-only preference fields are discarded when the launcher saves preferences. Launcher settings retain their historical local profile directory for migration; they are not sent to the server. Clipboard text is read only when you explicitly paste into the game and stays inside its process.

## Development and testing

Use Node.js, npm and a JDK with java/javac available (JDK 17 or newer): npm install, npm run prepare:game, npm start. prepare:game imports Flash from your existing official Dungeon Blitz R installation without modifying that installation. npm run package creates a versioned portable build and refreshes the root executable, then verifies packaged source, runtime hashes and security fuses.

npm test: URL/link validation, settings migration, audio delta validation, paste behavior and the actual native cursor policy.
npm run test:launcher: hidden launcher UI and live Flash rendering.
npm run test:native: same user-flow checks on a guarded inactive Windows desktop, native layout/focus, fullscreen, cursor configuration and real Windows audio-session attenuation using a silent fixture.
npm run test:input: live Flash email/password typing and paste compared with typed-reference pixels.
npm run test:render: real game captures and native bitmap dimensions at 1080p/1440p, bounded 50–300% zoom, animation-rate equality, fullscreen and focus.
npm run test:fps: actual game-loop counter at 1080p/1440p/fullscreen, independent fixture frame counts at 30/60/100 targets, forced CPU stalls and mouse click-through. Frame-rate controls exist only in the unshipped fixture.
npm run test:margins: live full-window Flash bounds, side-click focus and rendered magnification; a separate Flash fixture verifies actual stage MouseDown/MouseUp and aim coordinates.
npm run test:window: real Windows hit-test queries at every game edge/corner and exact native placement after launcher move/resize/maximize/fullscreen/settings. No OS pointer input is sent.

The presentation changes and audio adapter apply only to an exact, reviewed client revision. Unknown SWF revisions run unchanged and show a compatibility note in Settings. The client is fetched from the selected game origin normally; no game executable, credentials or gameplay data are bundled or replaced.

No test switches desktops, moves your mouse, sends OS keyboard input, uses your clipboard or logs into your account. Cursor ClipCursor calls are deliberately disabled in automated integration tests; state/shortcut routing is tested without physically confining your pointer. The inactive desktop has no Explorer, so taskbar visibility cannot be visually verified there. Login-screen tests do not prove authenticated dungeon combat, audio quality or long-session stability.

Building the small game-window Node-API module downloads a checksum-verified Zig 0.13.0 compiler and official Node-API headers into .test-tools. These build tools are not installed system-wide and are excluded from the portable package. The module uses the stable Node-API surface and is built from src/GameWindow.c; there is no C++ ABI dependency or third-party input-hook library.

See SECURITY.md for the remaining Flash and legacy Chromium risks. No claim of zero vulnerabilities, measured FPS improvement or Chromium feature parity is made.

The build downloads checksum-verified JPEXS 26.3.0 and the publicly served reviewed Minesa client into .test-tools. Only a bounded, hash-validated audio delta and the launcher-owned adapter are shipped; the complete game SWF and compiler are excluded. Building verifies that 3,746 original method bodies outside the reviewed audio hooks remain byte-identical.

See docs/CLIENT-FEATURES.md for historical neural and frame-interpolation experiments, including why the live enhancer was removed. RIFE frame generation was tried offline at 720p and 360p, with equal-duration motion checks. Live frame generation is not shipped; 60/120 distinct game frames have not been established.

## Public source repository

The repository contains launcher source, generated brand assets and development tests. Local profiles, test captures, executable builds and the imported Flash/runtime binaries are excluded. Build locally after installing the official Dungeon Blitz R application. This is a community launcher; game definitions and private server behavior belong to their respective owners.
