# Client features

## Display

The native Flash renderer is the default. Game scale ranges from 50% to 300%; scales above Fit crop the picture. Rendering resolution is independent: 100%, 75% or 50%, with lower values trading sharpness for fewer raster pixels. Normal 1080p/1440p views use native bitmap sizing with Windows DPI compensation. Large surfaces retain the existing raster budget.

Widescreen extends the horizontal world view using original artwork. Centered camera changes only the reviewed horizontal follow clamps; room rays, vertical floors and native smoothing remain. Centered hotbar restores the original HUD arrangement inside the wide world. See [widescreen internals](WIDESCREEN.md).

F11 toggles fullscreen. Escape stays with game menus; in Settings it dismisses the dialog or cancels key capture. Ctrl+, opens Settings. Closing, changing characters and reconnecting have no leave-game confirmation.

## GPU world mode

GPU mode keeps native Flash for gameplay, NPCs, dialogue, input, audio and HUD. A WebGL2 worker composites retained world artwork. Two artwork workers decode bounded cache entries; presentation transforms interpolate between native snapshots. It does not capture the final game frame or change game clocks.

The adjustable 15–1000 cap limits world rendering. Status reports completed world renders and source snapshots separately. The in-game FPS counter measures Main's ENTER_FRAME cadence. None measures physical scanout.

Unknown clients/assets, unsupported scenes, stale data and GPU faults restore Original rendering. Cleanup waits for active transactions; unacknowledged native-worker shutdown disables retries until reconnect. Sustained collection cost restores Original with bounded backoff. Singleplayer GPU remains unavailable.

Both multiplayer renderer choices use the existing Flash profile. Old WebView2 storage is left untouched.

## 120 FPS player

This optional multiplayer player renders the original game scene on the GPU with a 120 FPS cap. Automatic movie timelines retain their effective 60/s ceiling; the movie's requested rate and elapsed-time game step remain unchanged. Settings reports completed GPU renders separately from the in-game callback counter and physical scanout.

It uses a separate sign-in profile and a separately qualified client/artwork inventory. Unknown deployments restore Original; the saved renderer choice remains. Initial asset parsing can lower startup FPS. Custom pointers and reduced rendering resolution are not supported in this player yet; those preferences remain available in the Flash modes. Singleplayer retains its independent Original contract.

## Controls

- Autorun defaults to typed Ö and can be rebound to a validated physical key. It holds the direction selected when activated. Toggle, manual movement, text/menu context, Settings, hide and disabling stop it. An active run survives ordinary focus loss; it never sends input to another application.
- Optional Left Shift mounting forwards the current native mount binding. Original Shift typing, right Shift and existing bindings remain. Game/server restrictions still apply.
- Cursor lock is opt-in and uses its saved shortcut. Settings, blur, hiding and close release it. Escape and F11 remain reserved; Alt+Tab and Alt+F4 retain their Windows behavior.
- Crosshairs are optional game-window cursors. Original recoloring preserves cursor geometry and alpha; system cursors are not changed.

## Audio and links

Master volume affects only the game process tree. Reviewed audio adapters add music, effects, UI and ambience levels without replacing the original fade logic. Unsupported clients retain master volume but disable category controls.

Rankings and approved external game links open in the default browser. Genuine game reload links retain their native behavior.

## Settings and compatibility

Settings edits are local drafts until Save. Discard, Close, Back and Escape do not apply them. Saving a new server address does not reconnect. The explicit Reconnect action applies server/renderer changes; acceleration requires restart.

Display, input and category-audio helpers depend on reviewed client contracts. Window controls, settings and signed updating remain independent. See [compatibility review](MINESA-UPDATES.md) and [test coverage](TESTING.md).
