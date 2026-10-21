# Security

## Runtime

The launcher runs trusted local UI in Electron. The game runs in a separate sandboxed Electron 11 process with Adobe Flash 32.0.0.363. Remote content has no Node integration, remote module, general browser UI or privileged shell API.

Flash and Chromium 87 no longer receive security updates. Process separation and compatibility checks do not repair their vulnerabilities or establish protection against malicious SWFs. Adobe's [end-of-life notice](https://www.adobe.com/products/flashplayer/end-of-life-alternative.html) and [APSB20-58](https://helpx.adobe.com/security/products/flash-player/apsb20-58.html) describe this limitation. Use the launcher only with a trusted game server.

## Game content and adapters

HTTP requests are restricted to the selected game origin. Navigation, popups and downloads are denied unless an explicit game link passes the external-link policy. Rankings links resolve to the official HTTPS endpoint. Flash TCP sockets are not confined by the HTTP policy.

Presentation and audio adapters check exact source hashes or a complete reviewed structural contract. Reconstruction is bounded and verifies method bodies, symbols, branch offsets and exception tables. Unknown clients run without incompatible enhancements. Recipes are local signed resources; downloaded content cannot supply patches or compiler instructions.

GPU mode validates the client and loaded artwork before replacing the world compositor. Unsupported scenes and worker failures restore native rendering. It does not change simulation, authentication or packet cadence.

The native control pipe uses a random token, bounded messages and validated commands. Child processes receive a restricted environment. Cursor and audio controls affect the game window or its process tree. They do not record keystrokes or alter system cursor definitions, master audio or other applications.

## Singleplayer

The bundled server is imported from a pinned Git commit. Accounts, saves, environment files and another checkout's working changes are excluded. Each launcher profile owns one locked world on OS-assigned loopback ports. Normal shutdown waits for persistence. Manual local-server URLs remain external to this lifecycle.

Server code and dependencies are stored in a secondary ASAR; static artwork is unpacked for HTTP streaming. Both archives are registered in the executable's integrity table. Production integrity fuses remain enabled.

## Updates and installation

Automatic updates use a fixed GitHub repository and a pinned Ed25519 public key. The signed manifest covers the version, platform, ZIP and every extracted path, size and SHA-256. Verification rejects rollback, extra files, traversal, device paths, links, excessive expansion and changed payloads. Filesystem operations use physical ASAR bytes, not Electron's virtual archive directories.

The private signing key is outside Git and restricted to its owner and SYSTEM. Release access alone cannot create an accepted automatic update. Same-user malware or theft of the signing key remains outside that protection.

The per-user installer requires no elevation. Installation refuses while this installation has a running process; it never closes a game. Updates assemble a versioned build before replacing the root launcher and preserve previous shims. Uninstall removes recorded application files and leaves profiles and unrelated files.

**The Setup EXE is not Authenticode signed.** Its published checksum verifies the download; the portable update payload has the separate Ed25519 signature. The Inno compiler's publisher signature is not a signature on our installer.

## Testing and prototypes

Integration tests use disposable profiles and an inactive Windows desktop. They do not switch desktops, access saved credentials or send global input. Cursor confinement is tested with a fake API; an inactive desktop cannot establish Explorer/taskbar behavior.

The standalone-projector/AppContainer prototype is excluded from releases because isolated persistence is not working. See [projector status](docs/PROJECTOR.md). It supplies no protection to the shipped launcher.
