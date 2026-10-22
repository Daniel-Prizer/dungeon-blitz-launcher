# Architecture

## Processes

| Component | Responsibility |
| --- | --- |
| Electron shell: main.cjs, preload.cjs, ui.js | Local Settings, window layout, preferences and update coordination |
| LegacyRuntime | Start the Original game host and exchange validated control messages |
| NativePlayerRuntime / native-player-resources | Admit the reviewed multiplayer client and assets, broker public resources, and start the separate native GPU player |
| legacy/main.cjs and NativeHost.cs | Flash window, client interception, attachment, input and process-scoped audio |
| BlitzDisplay / BlitzAudio / BlitzInput | Revision-checked game presentation, audio and own-stage input helpers |
| Retained GPU session and workers | Research fixtures only; no production renderer choice |
| Singleplayer utility process | One owned local server/world per profile |
| UpdateInstaller / InstallMaintenance | Verified file installation, previous-build retention and recorded-file cleanup |

These process boundaries are useful. Remote game content should not share the shell's privileges; server shutdown and native controls also need independent lifecycles. Collapsing the application into one process would weaken those boundaries.

## Source boundaries

`game-source.cjs` owns official page addresses and bounded public downloads. Production runtime selection and public compatibility checks use it directly, without importing the retired WebView2 runtime or its adapter recipes. `modern-runtime.cjs` remains available to the existing research fixtures; it is not selected by the production shell.

Client reconstruction belongs in the legacy adapter modules. Game hashes, recipes and artwork manifests are data contracts, not configuration to relax when an update fails. Local and multiplayer contracts remain separate.

GPU code separates collection, scene validation, interpolation, resource decoding and graphics submission. The worker queue is bounded. Native gameplay owns clocks, input, audio and networking. The local module bundler accepts a limited syntax; changes to its grammar need bundle tests on the legacy engine.

High FPS uses a pinned Ruffle fork. A configurable presentation clock is independent of automatic timelines capped at the existing Flash host's effective 60/s. The client's elapsed-time simulation remains unchanged. Admission requires the complete Original adapter contract and separately qualified source/output hashes, inventory and artwork hashes. Unknown sources restore Original without changing the saved renderer choice. Raster density changes the Stage viewport transform and inverse input mapping together. Completed-render statistics feed both counters.

The shell brokers only listed public resources over a token-authenticated loopback HTTP server. The native player cannot fetch arbitrary origins or files, open a browser directly, or execute browser JavaScript. TCP is restricted to the reviewed game endpoint on port 8080, including when the other official asset origin is selected. Its settings pipe shares the existing bounded authentication and window bridge. Storage belongs to a separate native-player profile; existing Flash login state is never copied.

Public MP3 downloads have an exact name allowlist, format validation, two concurrent fetches and a bounded memory cache. The refresh path carries only a bounded account ID and character name in memory for one reconnect. Native Play and revive handlers retain authentication, cooldowns and packet checks. Refresh cannot apply pending server or renderer drafts.

## Assessment

The codebase has useful isolation and regression coverage, but accumulated avoidable maintenance debt:

- Dense multi-statement lines obscured lifecycle and error paths. Shared formatting now makes those paths reviewable.
- User documentation mixed instructions, release diaries, test logs and abandoned experiments. Documents now describe the current system; Git retains the historical versions.
- URL policy was coupled to a retired runtime. It is now a small shared source module.
- The shell and native host entry points still coordinate too many concerns. Extract cohesive settings, window and interception handlers as those areas change; avoid introducing a generic framework around them.
- Retired WebView2/projector research and some packaging support remain alongside active code. Remove their shipped resources only after the packaging and independent fixtures no longer depend on them.
- Build/research scripts still repeat fixture setup and depend on ignored local inputs. Consolidating fixture construction and making clean-checkout preparation reproducible are worthwhile follow-ups.
- Native C#/AS3 methods still need a separate readability pass with their compiler and bytecode fixtures. They were not mechanically rewritten alongside JavaScript.

A full rewrite is not justified by this audit. Refactor bounded responsibilities behind existing tests and keep compatibility checks intact.

References: [Diátaxis](https://diataxis.fr/) for documentation structure, [Fowler](https://martinfowler.com/bliki/VibeCoding.html) for the distinction between generated and reviewed code, [Prettier](https://prettier.io/docs/options) for formatting, and [commit-message guidance](https://cbea.ms/git-commit/) for concise history.
