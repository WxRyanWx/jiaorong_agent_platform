# Jiaorong CLI

This directory is the product-owned Jiaorong CLI workspace. The production CLI uses an installed, running JiaorongAI application as its real backend through a validated loopback bridge; it does not modify JiaorongAI or read its database directly.

## Current implementation boundary

- Versioned v1 JSON Schemas and all 18 frozen golden JSONL fixtures are implemented.
- The protocol validator enforces Schema, event ordering, content, tool correlation, and terminal status/error/exit invariants.
- The black-box runner reports only the active deterministic inventory. Live JiaorongAI cases and deferred historical cases have separate inventories and never inflate deterministic missing coverage.
- The foreground CLI core supports argument/stdin input, `text`, `json`, and `stream-json` projection, stdout/stderr separation, and a backend adapter seam.
- The test distribution uses a deterministic fixture backend through the full CLI path.
- The production entry point uses only the JiaorongAI App Backend. It verifies the installed application and loopback bridge, reports doctor/model readiness, and can execute a real single turn without enabling the fixture backend.

## Install and start

Install the supported JiaorongAI 0.5.6 application at `/Applications/JiaorongAI.app`. The CLI verifies the exact `app.asar` SHA-256; another build with the same display version fails closed until it has separate compatibility evidence.

Install a packaged candidate globally, then verify which command is being used:

```bash
npm install --global ./jiaorong-cli-0.1.0.tgz
command -v jiaorong-cli
jiaorong-cli --version
jiaorong-cli doctor --output-format json
```

If JiaorongAI is absent, the CLI launches it with a loopback-only debugging endpoint. If it is already running without that endpoint, the CLI does not restart it: quit JiaorongAI manually only when safe, then retry `jiaorong-cli doctor`.

## Usage

```bash
jiaorong-cli doctor --output-format json
jiaorong-cli models list --output-format json
jiaorong-cli \
  -p "Reply with a short confirmation" \
  --model <model-id> \
  --output-format stream-json
jiaorong-cli \
  -p "Continue the same conversation" \
  --resume <session-id> \
  --output-format stream-json
jiaorong-cli \
  -p "Compare the selected files" \
  --file ./notes.md \
  --file ./brief.txt \
  --add-dir /explicit/additional/directory \
  --output-format stream-json
```

Credentials remain owned by JiaorongAI. `doctor` and `models list` are read-only and never print provider credentials. Because JiaorongAI exposes no read-only credential-validity signal, doctor reports authentication as `warn` until a run starts. Before creating an Agent Session, a run uses JiaorongAI's provider connection check. JiaorongAI 0.5.6 returns only an unstructured `errorMsg` when that check fails, so the App Backend does not guess from its text: every failed connection check is projected as a redacted `INTERNAL_ERROR`. `AUTH_REQUIRED` is reserved for a future verified structured discriminator.

Public Model IDs are provider-qualified (`<encoded-provider-id>/<encoded-model-id>`). Use the exact `id` returned by `models list`; display names are not stable identifiers.

JiaorongAI owns durable Session history. Save the `sessionId` from a successful run and pass it to a later process with `--resume`; the CLI sends only the new prompt and never replays visible history. Different Sessions may run concurrently. One Session permits only one active run at a time; a competing run fails with `INVALID_ARGUMENT` and exit `42` before a second stream starts. Do not run the same Agent Session concurrently in JiaorongAI desktop and the CLI: the version-pinned permission reset uses `chat.stopStream`, and the desktop idle check cannot eliminate the final race atomically.

`--file` and `--add-dir` are repeatable structured arguments; paths are never interpolated into the prompt. The current working directory is the Project Root. An Attachment outside it is accepted only when its canonical real path is inside an explicit Additional Directory. Traversal, symlink escape, macOS Finder aliases, missing/unreadable files, and unsupported types fail before the App Backend creates a Session. Plain text, Markdown, and JSON Attachments are verified for v1. PNG, JPEG, WebP, and GIF are structurally accepted, but real image recognition is waived and must not be presented as a verified first-release capability.

Tool snapshots are projected as one correlated `tool_use` and one terminal `tool_result`. Tool input is capped at 8 KiB and recursively redacts credential-shaped keys; successful output is capped at a 16 KiB UTF-8 preview and marks `truncated=true` when bounded. In default mode, an owned pending permission interaction is denied immediately through JiaorongAI's real response bridge—never through stdin—and the CLI continues waiting for the resulting tool snapshot.

JiaorongAI 0.5.6 always remains in its own `default` Permission Mode: its native `full_access` mode is not used because it can cross the Project Root. CLI `full_access` is explicit and approves only correlated built-in file permission requests whose canonical targets are inside the Project Root or an explicit Additional Directory. Crossed metadata, unknown tools, outside paths, and unprovable operations are denied. JiaorongAI still executes approved tools; the CLI does not reimplement them. The App Backend clears the pinned build's per-Session approval cache before and after every settled run. Removing `--add-dir` blocks a new access but does not erase content already present in durable Session history.

Shell is not safe on the 0.5.6 App Backend: live evidence proved that commands such as an outside-root `cat` can execute without any permission interaction. CLI-created Sessions therefore persist `exec` and `process` in `disabledAgentTools`, and resume rejects a Session if either has been re-enabled. This accepted first-release limitation keeps the filesystem boundary fail-closed under ADR 0019.

The v1 safety limits are 16 Attachments, 16 Additional Directories, 30 MiB per Attachment, 60 MiB total Attachment source size, and 4,096 UTF-8 bytes per supplied path. JiaorongAI prepares accepted files. `init.attachments` contains only generated ID, basename, MIME, and byte size; prepared text, image data, thumbnails, and absolute paths are not projected into that metadata.

Ctrl-C asks JiaorongAI to stop the real run and waits for a verified terminal state. A second Ctrl-C exits locally with code 130 without claiming remote cancellation. An automation caller may force-kill after the 30-second grace period, but a stream without `result` is then a protocol failure, not a successful cancellation.

`--max-turns` accepts a positive integer. The pinned JiaorongAI App Backend performs one turn per Headless Run, so `--max-turns 1` does not stop a normal run. It does not limit JiaorongAI's internal tool-loop steps because version 0.5.6 exposes no such bridge control. `--timeout <seconds>` stops through the same remote settlement path and allows at most 30 seconds for cancellation settlement.

## Uninstall

```bash
npm uninstall --global @jiaorong/cli
command -v jiaorong-cli
```

Uninstall removes only the CLI package and command links. It does not remove or modify `/Applications/JiaorongAI.app`, JiaorongAI account state, or Agent Sessions.

## Development

```bash
npm install
npm test
node ./bin/jiaorong-cli-conformance.mjs \
  --binary ./tests/fixtures/conformant-cli.mjs \
  --protocol 1
```

The conformance command exits `0` only when all 98 active deterministic cases execute, no case fails, and `missingCaseIds` is empty. Live JiaorongAI and deferred inventories remain separate.
