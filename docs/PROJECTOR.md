# Projector prototype

The standalone Adobe projector/AppContainer path is experimental and excluded from releases. Production uses the separate Electron 11 / Flash host.

## Implemented

- Projector 32.0.0.465 is hash-pinned to `a4b333ac1da12026989549015303d82231982838bccfb544ba5fd188746066f0`.
- SandboxHost starts it with AppContainer capabilities, no inherited handles, a restricted environment and a one-process job assigned before resume.
- Synthetic tests cover outside-file access, child creation, loopback denial and a limited settings/movie bridge on an inactive desktop.

## Blockers

Isolated SharedObject persistence still fails. Settings exchange and internal bitmap probes do not establish working sign-in storage, game rendering, input, audio or links. Do not copy existing credentials or grant access to the user's full Flash storage to make the fixture pass.

Internet capability is broad outbound access. A game-only broker/OS destination policy and origin-partitioned sandbox identities would need separate design and verification. HTTP restrictions do not contain arbitrary native Flash sockets.

Moving to a newer unsupported projector would not repair Flash vulnerabilities. A replacement can ship only after isolated persistence, complete game/settings behavior and live-server compatibility work without weakening the boundary. The prototype supplies no security protection to the current launcher.
