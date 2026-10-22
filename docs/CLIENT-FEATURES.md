# Client features

## Display

The native Flash renderer is the default. Game scale ranges from 50% to 300%; scales above Fit crop the picture. Rendering resolution is independent: 100%, 75% or 50%, with lower values trading sharpness for fewer raster pixels. Normal 1080p/1440p views use native bitmap sizing with Windows DPI compensation. Large surfaces retain the existing raster budget.

Widescreen extends the horizontal world view using original artwork. Centered camera changes only the reviewed horizontal follow clamps; room rays, vertical floors and native smoothing remain. Centered hotbar restores the original HUD arrangement inside the wide world. See [widescreen internals](WIDESCREEN.md).

F11 toggles fullscreen. Escape stays with game menus; in Settings it dismisses the dialog or cancels key capture. Ctrl+, opens Settings. Closing, changing characters and reconnecting have no leave-game confirmation.

## High FPS

The optional multiplayer player renders the whole original scene on the GPU. Its cap ranges from 30 to 1000, defaulting to 240; actual throughput depends on the scene and PC. Both Settings and the in-game counter report completed game renders. Settings also shows the measured average and range. Physical scanout is not measured.

Automatic movie timelines retain their effective 60/s ceiling; the requested movie rate, elapsed-time game step, timers and network code remain unchanged. Lowering rendering resolution reduces raster work without changing picture zoom or the gameplay viewport. Cap and resolution changes apply on Save.

High FPS uses a separate sign-in profile and a qualified client/artwork inventory. Unknown deployments restore Original while preserving the saved choice. Singleplayer retains its independent Original contract. The old retained-world GPU option is retired; its saved selection migrates to High FPS. Existing profiles remain on disk.

The tutorial keeps its authored 3:2 viewport so scripted targets and backgrounds align. Widescreen resumes after leaving the tutorial.

## Controls

- Autorun defaults to typed Ö and can be rebound to a validated physical key. It holds the direction selected when activated. Toggle, manual movement, text/menu context, Settings, hide and disabling stop it. An active run survives ordinary focus loss; it never sends input to another application.
- Optional Left Shift mounting forwards the current native mount binding. Original Shift typing, right Shift and existing bindings remain. Game/server restrictions still apply.
- Cursor lock is opt-in and uses its saved shortcut. Settings, blur, hiding and close release it. Escape and F11 remain reserved; Alt+Tab and Alt+F4 retain their Windows behavior.
- Crosshairs are optional game-window cursors. Original recoloring preserves cursor geometry and alpha; system cursors are not changed.
- Enter activates the existing revive button when it is available. Chat, native cooldowns and held-key suppression still apply.
- The top-right refresh arrow restarts the current game and requests the same character through its normal Play handler. Resume expires after 60 seconds and cancels on manual input, a different account or a missing character. It requires the game's normal remembered session; no credentials are captured.

## Audio and links

Master volume affects only the game process tree. Reviewed audio adapters add music, effects, UI and ambience levels without replacing the original fade logic. Unsupported clients retain master volume but disable category controls.

The High FPS broker admits the reviewed public MP3 names alongside SWF artwork. Mixing clips the final sum once, preventing overflow when effects overlap. Cached ability artwork retains child filters and original icon colors.

Rankings and approved external game links open in the default browser. Genuine game reload links retain their native behavior.

## Settings and compatibility

Settings edits are local drafts until Save. Discard, Close, Back and Escape do not apply them. Crosshair, display and sound settings apply without restarting and are restored when the game replaces its session. Saving a new server address does not reconnect. The explicit Reconnect action applies server/renderer changes; acceleration requires restart.

Display, input and category-audio helpers depend on reviewed client contracts. Window controls, settings and signed updating remain independent. See [compatibility review](MINESA-UPDATES.md) and [test coverage](TESTING.md).
