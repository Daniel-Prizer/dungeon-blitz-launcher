# Dungeon Blitz Launcher

A Windows launcher for Dungeon Blitz, with the original Flash runtime, multiplayer and a bundled singleplayer server.

## Install

Download **Dungeon Blitz Launcher Setup.exe** from the [latest release](https://github.com/Daniel-Prizer/dungeon-blitz-launcher/releases/latest). The portable ZIP is available on the same page. Updates install after the game closes and keep the previous build.

## Features

- Fullscreen, widescreen and optional centered camera/HUD layouts.
- Independent game sound levels, cursor controls and configurable autorun.
- Rankings and other game links open in your default browser.
- Singleplayer worlds managed by the launcher, without a separate server setup.
- Optional GPU world rendering. Gameplay and dialogue stay in native Flash.
- An optional 120 FPS player for reviewed multiplayer clients.

Open **Settings** to change these options. Save applies settings; changing the server or renderer also requires **Reconnect**. **F11** toggles fullscreen and **Ctrl+,** opens Settings. Autorun defaults to **Ö** and can be rebound under Controls.

For singleplayer, choose **Settings → Connection → Use singleplayer**, Save, then Reconnect. Each launcher profile has its own world, which saves when the launcher closes.

## Rendering

Original Flash is the default. GPU world mode renders artwork separately and interpolates between native snapshots. Its counter measures world renders, not whole-game FPS. Its 1000 cap is a ceiling.

The **120 FPS player · Beta** runs the game in a native GPU player with separate animation timing. It uses its own sign-in profile. Performance depends on the scene and hardware; cold artwork loading can take longer. Custom pointers and reduced rendering resolution currently require Original or GPU world mode. Singleplayer uses Original.

Client-dependent enhancements disable themselves when the downloaded game no longer matches a reviewed compatibility contract. The unmodified game remains available.

## Development

See [build instructions](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [tests](docs/TESTING.md) and [client compatibility](docs/MINESA-UPDATES.md). [Security](SECURITY.md) describes runtime and update boundaries.

Windows 10 or later is required. Flash and its embedded Chromium runtime are unsupported; this project does not provide security updates for them.
