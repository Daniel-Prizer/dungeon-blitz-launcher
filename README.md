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

Open **Settings** to change these options. Save applies settings; changing the server or renderer also requires **Reconnect**. **F11** toggles fullscreen and **Ctrl+,** opens Settings. Autorun defaults to **Ö** and can be rebound under Controls.

For singleplayer, choose **Settings → Connection → Use singleplayer**, Save, then Reconnect. Each launcher profile has its own world, which saves when the launcher closes.

## Rendering

Original Flash is the default. GPU mode renders world artwork separately and interpolates movement between native snapshots. Its world-render counter is different from native game FPS and monitor refresh. A cap of 1000 is a ceiling, not a performance claim. Whole-game 100+ FPS has not been achieved. Singleplayer uses Original.

Client-dependent enhancements disable themselves when the downloaded game no longer matches a reviewed compatibility contract. The unmodified game remains available.

## Development

See [build instructions](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [tests](docs/TESTING.md) and [client compatibility](docs/MINESA-UPDATES.md). [Security](SECURITY.md) describes runtime and update boundaries.

Windows 10 or later is required. Flash and its embedded Chromium runtime are unsupported; this project does not provide security updates for them.
