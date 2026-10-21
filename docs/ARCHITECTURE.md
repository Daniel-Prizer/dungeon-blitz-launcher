# Architecture

## Processes

| Component | Responsibility |
| --- | --- |
| Electron shell: main.cjs, preload.cjs, ui.js | Local Settings, window layout, preferences and update coordination |
| LegacyRuntime / NativeGpuRuntime | Start the native game host and exchange validated control messages |
| legacy/main.cjs and NativeHost.cs | Flash window, client interception, attachment, input and process-scoped audio |
| BlitzDisplay / BlitzAudio / BlitzInput | Revision-checked game presentation, audio and own-stage input helpers |
| GPU session and workers | Retained artwork decoding, world composition and bounded presentation interpolation |
| Singleplayer utility process | One owned local server/world per profile |
| UpdateInstaller / InstallMaintenance | Verified file installation, previous-build retention and recorded-file cleanup |

These process boundaries are useful. Remote game content should not share the shell's privileges; server shutdown and native controls also need independent lifecycles. Collapsing the application into one process would weaken those boundaries.

## Source boundaries

`game-source.cjs` owns official page addresses and bounded public downloads. Production runtime selection and public compatibility checks use it directly, without importing the retired WebView2 runtime or its adapter recipes. `modern-runtime.cjs` remains available to the existing research fixtures; it is not selected by the production shell.

Client reconstruction belongs in the legacy adapter modules. Game hashes, recipes and artwork manifests are data contracts, not configuration to relax when an update fails. Local and multiplayer contracts remain separate.

GPU code separates collection, scene validation, interpolation, resource decoding and graphics submission. The worker queue is bounded. Native gameplay owns clocks, input, audio and networking. The local module bundler accepts a limited syntax; changes to its grammar need bundle tests on the legacy engine.

## Assessment

The codebase has useful isolation and regression coverage, but accumulated avoidable maintenance debt:

- Dense multi-statement lines obscured lifecycle and error paths. Shared formatting now makes those paths reviewable.
- User documentation mixed instructions, release diaries, test logs and abandoned experiments. Documents now describe the current system; Git retains the historical versions.
- URL policy was coupled to a retired runtime. It is now a small shared source module.
- The shell and native host entry points still coordinate too many concerns. Extract cohesive settings, window and interception handlers as those areas change; avoid introducing a generic framework around them.
- Retired WebView2/projector research and some packaging support remain alongside active code. Remove their shipped resources only after the packaging and independent fixtures no longer depend on them.
- Build/research scripts still repeat fixture setup and depend on ignored local inputs. Consolidating fixture construction and making clean-checkout preparation reproducible are worthwhile follow-ups.
- Native C#/AS3 methods still need a separate readability pass with their compiler and bytecode fixtures. They were not mechanically rewritten alongside JavaScript.

A full rewrite is not justified by this audit. Refactor bounded responsibilities behind existing tests, and keep compatibility checks intact. Formatting and a cleaner README do not establish a completed architecture migration or solve the whole-game FPS limit.

References: [Diátaxis](https://diataxis.fr/) for documentation structure, [Fowler](https://martinfowler.com/bliki/VibeCoding.html) for the distinction between generated and reviewed code, [Prettier](https://prettier.io/docs/options) for formatting, and [commit-message guidance](https://cbea.ms/git-commit/) for concise history.
