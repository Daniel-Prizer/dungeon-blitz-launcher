# Dungeon Blitz Launcher

A Windows launcher for Dungeon Blitz, with the original Flash runtime, multiplayer and a bundled singleplayer server.

## Install

Download **Dungeon Blitz Launcher Setup.exe** from the [latest release](https://github.com/Daniel-Prizer/dungeon-blitz-launcher/releases/latest). The portable ZIP is available on the same page. Updates install after the game closes and keep the previous build.

## Features

- Fullscreen, widescreen and optional centered camera/HUD layouts.
- Independent game sound levels, cursor controls and configurable autorun.
- Rankings and other game links open in your default browser.
- Singleplayer worlds managed by the launcher, without a separate server setup.
- Optional High FPS rendering for reviewed multiplayer clients.
- Refresh to the same character and Enter to revive.

Open **Settings** to change these options. Save applies settings; changing the server or renderer also requires **Reconnect**. **F11** toggles fullscreen and **Ctrl+,** opens Settings. Autorun defaults to **Ö** and can be rebound under Controls.

For singleplayer, choose **Settings → Connection → Use singleplayer**, Save, then Reconnect. Each launcher profile has its own world, which saves when the launcher closes.

## Rendering

Original Flash is the default. **High FPS** runs the original game in a native GPU player, preserving game and animation timing. It uses a separate sign-in profile. The frame cap defaults to 240 and accepts 30–1000; actual performance depends on the scene and hardware.

Frame cap, rendering resolution, sound and custom pointers apply on Save. Try 75% rendering resolution for more FPS with softer artwork. Singleplayer uses Original.

The refresh button at the top right reloads the game and resumes the same character through the normal remembered session. Expired sign-in or an unavailable character leaves the normal login/selection screen open. Enter activates the available revive button; chat typing and revive cooldowns are preserved.

Client-dependent enhancements disable themselves when the downloaded game no longer matches a reviewed compatibility contract. The unmodified game remains available.

## Development

See [build instructions](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [tests](docs/TESTING.md) and [client compatibility](docs/MINESA-UPDATES.md). [Security](SECURITY.md) describes runtime and update boundaries.

Windows 10 or later is required. Flash and its embedded Chromium runtime are unsupported; this project does not provide security updates for them.
