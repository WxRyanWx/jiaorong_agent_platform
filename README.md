# Jiaorong CLI

This directory is the product-owned Jiaorong CLI workspace. The production CLI uses an installed, running JiaorongAI application as its real backend through a validated loopback bridge; it does not modify JiaorongAI or read its database directly.

## Current implementation boundary

- Versioned v1 JSON Schemas and all 18 frozen golden JSONL fixtures are implemented.
- The protocol validator enforces Schema, event ordering, content, tool correlation, and terminal status/error/exit invariants.
- The black-box runner reports only the active deterministic inventory. Live JiaorongAI cases and deferred historical cases have separate inventories and never inflate deterministic missing coverage.
- The foreground CLI core supports argument/stdin input, `text`, `json`, and `stream-json` projection, stdout/stderr separation, and a backend adapter seam.
- The test distribution uses a deterministic fixture backend through the full CLI path.
- The production entry point uses only the JiaorongAI App Backend. It verifies the installed application and loopback bridge, reports doctor/model readiness, and can execute a real single turn without enabling the fixture backend.

## Current usage

JiaorongAI 0.5.6 must be installed and running with its verified loopback debugging endpoint.

```bash
node ./bin/jiaorong-cli.mjs doctor --output-format json
node ./bin/jiaorong-cli.mjs models list --output-format json
node ./bin/jiaorong-cli.mjs \
  -p "Reply with a short confirmation" \
  --model <model-id> \
  --output-format stream-json
node ./bin/jiaorong-cli.mjs \
  -p "Continue the same conversation" \
  --resume <session-id> \
  --output-format stream-json
node ./bin/jiaorong-cli.mjs \
  -p "Compare the selected files" \
  --file ./notes.md \
  --file ./diagram.png \
  --add-dir /explicit/additional/directory \
  --output-format stream-json
```

Credentials remain owned by JiaorongAI. `doctor` and `models list` are read-only and never print provider credentials. Because JiaorongAI exposes no read-only credential-validity signal, doctor reports authentication as `warn` until a run starts. Before creating an Agent Session, a run uses JiaorongAI's provider connection check. JiaorongAI 0.5.6 returns only an unstructured `errorMsg` when that check fails, so the App Backend does not guess from its text: every failed connection check is projected as a redacted `INTERNAL_ERROR`. `AUTH_REQUIRED` is reserved for a future verified structured discriminator.

Public Model IDs are provider-qualified (`<encoded-provider-id>/<encoded-model-id>`). Use the exact `id` returned by `models list`; display names are not stable identifiers.

JiaorongAI owns durable Session history. Save the `sessionId` from a successful run and pass it to a later process with `--resume`; the CLI sends only the new prompt and never replays visible history. Different Sessions may run concurrently. One Session permits only one active run at a time; a competing run fails with `INVALID_ARGUMENT` and exit `42` before a second stream starts.

`--file` and `--add-dir` are repeatable structured arguments; paths are never interpolated into the prompt. The current working directory is the Project Root. An Attachment outside it is accepted only when its canonical real path is inside an explicit Additional Directory. Traversal, symlink escape, macOS Finder aliases, missing/unreadable files, and unsupported types fail before the App Backend creates a Session. Supported types are plain text, Markdown, JSON, PNG, JPEG, WebP, and GIF.

The v1 safety limits are 16 Attachments, 16 Additional Directories, 30 MiB per Attachment, 60 MiB total Attachment source size, and 4,096 UTF-8 bytes per supplied path. JiaorongAI prepares accepted files. `init.attachments` contains only generated ID, basename, MIME, and byte size; prepared text, image data, thumbnails, and absolute paths are not projected into that metadata.

## Development

```bash
npm install
npm test
node ./bin/jiaorong-cli-conformance.mjs \
  --binary ./tests/fixtures/conformant-cli.mjs \
  --protocol 1
```

The conformance command currently exits `1` because the active Deterministic Conformance Inventory is incomplete. Inspect `coverage` and `missingCaseIds` in its JSON summary; live and deferred inventories are reported separately.
