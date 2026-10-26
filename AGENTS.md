# Launcher maintenance

## Scope and safety

- Work in this launcher repository. Preserve unrelated changes, imported runtimes, old builds, installers, profiles and agent-owned copies. Do not edit a separate server checkout.
- Do not operate the user's input desktop, pointer, keyboard, clipboard or visible game. Use hidden synthetic tests or the guarded inactive desktop; never switch to it. No subagents unless requested.
- Never access saved authentication or log into an account during automated testing. Separate human-authorized live QA needs an explicit account/character scope and must keep credentials/captures private.
- Do not stop or restart games, farmers, servers or another agent's work. Branded production test processes can trigger process guards; use genuine independent fixtures. Read the local version hold before installation and honor update opt-out.
- Cursor tests never call ClipCursor, SetCursorPos or global input APIs. Test accessibility with fake APIs. Audio changes affect only the game's process tree, never endpoint master volume.

## Product behavior

- This is a dedicated launcher, not a browser. Keep remote Node integration, general navigation/download APIs and external debugging ports disabled.
- Settings remain drafts until Save. Discard, Close, Back and Escape do not apply edits. Save never reconnects; server/renderer changes use explicit Reconnect. Acceleration requires restart. Test 800×600 and 1440×900 with pinned heading/footer and keyboard tab navigation.
- F11/the fullscreen button toggle fullscreen. Escape belongs to native game menus and can close local Settings/key capture. Preserve Alt+Tab/Alt+F4 and ordinary game focus/key cleanup. Leaving, closing and reconnecting have no confirmation.
- The game window is attached to the shell. Keep own-process HTCLIENT handling and SWP_NOSIZE placement; verify native hit tests, viewport/raster/input alignment and DPI separately. Never subclass another process or change monitors/taskbar policy.
- Cursor lock is opt-in, with the actual saved checkbox as its single state. Keep the menu reachable, the 12-DIP edge inset and release on Settings/blur/hide/minimize/close. Acknowledgements retain shortcut repeat/chord state; rebinding resets it. Original recoloring preserves cursor geometry/alpha and never edits system definitions.
- Autorun defaults to typed Ö and supports a validated physical rebind. It reads facing/current bindings and uses the original own-stage input handler. Active running survives ordinary focus loss and opening the map; pending shortcut work does not survive blur. Toggle, manual movement, typing, the forge, Settings, hide and disable release it. No global key routing, keymap, physics or packet changes.
- Left Shift mounting is optional and reads the current native binding. Preserve typing, right Shift and chords, allow one pending action and reject a cursor-shortcut conflict.

## Client contracts

Read [compatibility](docs/MINESA-UPDATES.md) before diagnosing upstream breakage. Its reconstruction and presentation invariants apply to changes. Check actual public SWF bytes and loaded assets; never approve a hash or weaken guards to force compatibility. Review raw ABC and exceptions, preserving upstream fixes and unrelated methods/tags.

Keep multiplayer and loopback singleplayer contracts independent. Native clocks, animations, networking, authentication, stats, dungeon/session behavior and loot awards are outside launcher presentation edits. Unknown clients retain Original rendering and saved preferences.

Follow [widescreen invariants](docs/WIDESCREEN.md) for camera rays, terrain reuse, original HUD vectors, authored map geometry, transitions, matte anchoring and backdrop limits. Do not invent playable terrain, widen vertically from overall room bounds, stretch panels or conceal missing world art. Frame/counter controls belong only in fixtures.

High FPS uses the qualified native player. Keep presentation, automatic timelines and elapsed-time simulation on separate clocks. Count completed changing game renders separately from callbacks and scanout; a 1000 cap is not a throughput promise. Retained-world workers are research only. Preserve their collection budgets and shutdown guards when running those fixtures. The limited local module grammar must pass legacy bundle tests.

## Singleplayer and updates

- Import the owned server only from pinned immutable Git objects, excluding accounts/saves/environment/working changes. One locked world per profile, OS-assigned loopback ports and graceful persistence on shutdown. Manual local URLs remain external. Singleplayer uses Original and retains the multiplayer renderer preference.
- Keep code/dependencies in the secondary ASAR and static streamed content unpacked. Register every opened archive in INTEGRITY/ELECTRONASAR and test with exact production fuses, including a missing-entry negative control.
- Follow [Security](SECURITY.md) for origin restrictions, sanitized child environments, bounded/authenticated pipes, signed updates and recorded-file cleanup. Never expose a private key or bypass signature/hash/path/extra-file/running-process checks. Use original-fs for physical update ASAR files and helper-local long-path I/O; reject incoming device paths and junctions.
- Do not promote the projector prototype while persistence fails. Do not ship an unverified game runtime migration.

## Changes and verification

Every committed change includes a semantic version bump in root package.json, package-lock.json and src/legacy/package.json. Maintenance uses patch, features minor, breaking contracts major. Mention the result in the final response. Keep source and canonical runnable artifacts aligned; stage builds when runtimes may be active and retain versioned backups before promotion.

Use [development](docs/DEVELOPMENT.md) and [testing](docs/TESTING.md) for build/release commands. Run affected tests, inspect owned visual evidence and state fixture/live/desktop limits accurately. Commit only owned files. Keep documentation current and concise: user instructions in README, implementation contracts in the reference docs, transient diagnostics in ignored artifacts. Keep attribution and published release references intact when rewriting history.
