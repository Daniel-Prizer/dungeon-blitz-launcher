# Client audio and upscaling investigation — 9 October 2026

The audio adapter is implemented in 0.4.0. Upscaling remains an investigated next feature, not an enabled setting.

## Audio

The exact reviewed client SHA-256 is `7f3f40180f5d00f528c99ef7603eebdb89000dbef6ce154e2fb6695deb7c78ae`. Headless FFDec export of that client confirms `SoundManager.SetSoundVolume`, named embedded effects in `SoundManager.Play`, and separately indexed MP3 streams with individual volume controls in `method_218`, `method_103` and `method_748`. The dated 7 October live-source capture additionally identifies the music channel through `Game`'s `dbMusicVolumeInverted` setting, and another streaming channel used by `DayNightManager`.

Master attenuates the game's already mixed Windows audio sessions. The revision-pinned client adapter additionally applies independent Player, Music, Environment and Creatures gains before that mixing, with live updates for existing channels. Entity, ability, combat, projectile and speech sound calls carry their emitter context; room/world calls select Environment, and stream indices separate Music from ambience. A specific mob-water effect has not been identified or tested. `RunWater` and `LandOnWater` are names in SoundConfig; they do not establish which sound a particular enemy emits. Updates cover existing playing/looping channels as well as future playback.

## Live upscaling

[AMD FSR 1](https://gpuopen.com/fidelityfx-superresolution/) is a real spatial upscaler: its edge-adaptive reconstruction enlarges the input frame, followed by contrast-adaptive sharpening. It does not need motion vectors, depth or frame history. It is a plausible option for a GPU presentation path around the existing Flash renderer. [NVIDIA Image Scaling](https://www.nvidia.com/en-us/geforce/news/nvidia-image-scaler-dlss-rtx-november-2021-updates/) is another spatial scaling solution. Neither is implemented or benchmarked in this launcher.

[DLSS](https://developer.nvidia.com/rtx/dlss) needs engine integration and motion data. This launcher's Flash rendering path does not provide those inputs. [DLDSR](https://www.nvidia.com/en-us/geforce/news/gfecnt/20221/god-of-war-game-ready-driver/) is a different, driver-level technique: render above monitor resolution and downsample. It is not a drop-in upscaling API for this launcher.

A production upscaler would need game-only frame acquisition, a bounded GPU frame queue, reconstruction into a presentation surface, correct native input coordinates, cursor/focus/fullscreen handling, resizing/DPI recovery and an immediate original-rendering fallback. It must not capture the desktop or install a global input hook. Screenshot/PNG transfer per frame would add CPU copies and encoding; it is not the intended production architecture. Existing renderer captures prove individual Flash frames can be obtained, not sustained zero-copy GPU capture.

A minimal user-facing control can be Off / Upscale; implementation still needs measurements for frame time, added input delay and text/UI clarity. Upscaling does not add detail that is absent from source artwork. Native high-resolution Flash rendering should be compared first: some content can scale directly, and forcing a lower-resolution input may make that content worse. These presentation changes would not alter multiplayer packets or server state; compatibility still requires testing with the Minesa client.
