# Jiaorong CLI v0.1.0 command reference

## Contents

- [Runtime boundary](#runtime-boundary)
- [Commands and flags](#commands-and-flags)
- [Output contracts](#output-contracts)
- [Files, directories, and tools](#files-directories-and-tools)
- [Sessions](#sessions)
- [Limits](#limits)
- [Exit and error codes](#exit-and-error-codes)
- [Recovery](#recovery)

## Runtime boundary

- Platform verified: macOS arm64.
- Node requirement: `>=22`.
- App requirement: installed JiaorongAI.app `0.5.6`, exact supported bundle, loopback CDP endpoint.
- CLI version: `0.1.0`.
- App owns accounts, Providers, models, Sessions, tools, skills, and persistence.
- CLI owns arguments, validation, filesystem authority, output projection, cancellation, and exit behavior.
- Shell tools `exec` and `process` are always disabled.
- Image recognition is not part of the accepted first-release scope.

## Commands and flags

| Capability | Syntax | Notes |
|---|---|---|
| Version | `jiaorong-cli --version` | Must be the only argument. |
| Doctor | `jiaorong-cli doctor [--output-format text\|json]` | Read-only; default is text. |
| Models | `jiaorong-cli models list [--output-format text\|json]` | Use returned `id`, not display name. |
| Prompt | `-p TEXT` or `--prompt TEXT` | Last occurrence wins; non-empty prompt required after argv/stdin resolution. |
| Stdin prompt | `printf ... \| jiaorong-cli ...` | Use when no prompt flag is supplied. |
| Output | `--output-format text\|json\|stream-json` | Run default is text. |
| Model | `--model MODEL_ID` | Provider-qualified ID from `models list`. |
| Resume | `--resume SESSION_ID` | Continues the same durable JiaorongAI Session. |
| Permission | `--permission-mode default\|full_access` | Default is `default`; Shell stays disabled. |
| Attachment | `--file PATH` | Repeatable; use text/Markdown/JSON in accepted v1 workflows. |
| Extra scope | `--add-dir PATH` | Repeatable; authorizes a canonical external directory. |
| Timeout | `--timeout SECONDS` | Positive number; triggers verified remote cancellation. |
| Turn limit | `--max-turns INTEGER` | Positive integer; v1 App Backend itself performs one turn. |

There is no v1 `--help`, login/logout, Session list/delete, update, daemon, server, TUI, Shell, plugin, MCP, or subagent command.

## Output contracts

### text

- Success: stdout contains final Assistant text only.
- Failure: stdout is empty; stderr may contain human diagnostics; exit is nonzero.
- Do not use text mode for robust automation.

### json

- Stdout contains exactly one JSON object.
- Important fields: `protocolVersion`, `requestId`, `sessionId`, `status`, `content`, `model`, `turns`, `durationMs`, and `error`.
- `status` is `success`, `failed`, or `cancelled`.
- Preflight failure may have `sessionId: null` and `model: null` and must not create a Session.

### stream-json

- Stdout is JSONL, one object per line.
- First/unique: `init`.
- Last/unique: `result`.
- Optional middle events: `message`, `reasoning_summary`, `tool_use`, `tool_result`, and `error`.
- Concatenated `message.delta` equals `result.content`.
- A `tool_use` must have one matching terminal `tool_result` unless the process is forcibly killed.
- `result` is the sole terminal fact; ignore any later output as a protocol violation.

## Files, directories, and tools

- Current working directory is Project Root.
- Relative paths resolve from Project Root.
- External access requires an explicit `--add-dir`; `full_access` does not widen the boundary.
- Path validation rejects parent traversal, symlink escape, macOS Finder aliases, control characters, missing/unreadable files, and unsupported MIME.
- Accepted text types: plain text, Markdown, JSON.
- PNG/JPEG/WebP/GIF are structurally accepted, but first-release real visual recognition is waived and must not be promised.
- Tool event names include normalized Read, Write, Edit, Glob, and Grep behavior. JiaorongAI executes tools; CLI only validates and authorizes the bounded request.
- Tool inputs redact credential-shaped keys and are bounded; tool output is a bounded preview and may set `truncated: true`.

## Sessions

- A successful new run returns a durable Session ID.
- `--resume` restores the Session and sends only the new prompt.
- Different Sessions may run concurrently.
- The same Session permits one active Headless Run.
- Desktop/CLI concurrent use of the same Session is unsupported because permission reset and idle checking are not atomic upstream.
- The CLI exposes no v1 Session inventory or deletion command.

## Limits

| Limit | Value |
|---|---:|
| Attachments per run | 16 |
| Additional Directories per run | 16 |
| One Attachment | 30 MiB |
| All Attachment source bytes | 60 MiB |
| One supplied path | 4,096 UTF-8 bytes |
| SIGINT settlement grace | 30 seconds |

## Exit and error codes

| Exit | Meaning |
|---:|---|
| 0 | Success |
| 1 | Model, tool, timeout, or internal failure |
| 42 | Invalid input, argument, attachment, or protocol |
| 53 | Turn limit |
| 130 | Verified or forced SIGINT cancellation path |

| Machine code | Typical action |
|---|---|
| `AUTH_REQUIRED` | Authenticate in JiaorongAI; do not retry unchanged. Reserved until a structured discriminator exists. |
| `INVALID_ARGUMENT` | Correct arguments, Session, or concurrency; do not retry unchanged. |
| `UNSUPPORTED_PROTOCOL` | Use protocol v1-compatible consumer/CLI. |
| `MODEL_UNAVAILABLE` | Refresh models and retry another available exact ID or back off. |
| `PERMISSION_DENIED` | Narrowly authorize the required root/directory; do not bypass boundaries. |
| `TOOL_FAILED` | Inspect tool result; retry only when the action is safe and idempotent. |
| `UNSUPPORTED_ATTACHMENT` | Correct path/type/size; do not silently skip. |
| `TIMEOUT` | Decide whether retry is safe; prior side effects may exist. |
| `TURN_LIMIT` | Reconsider task shape; do not increase blindly. |
| `CANCELLED` | User/timeout cancellation; do not treat as success. |
| `INTERNAL_ERROR` | Run doctor; retry once only when side effects are safe. |

## Recovery

- App absent: CLI may launch the supported app with loopback debugging.
- App running without a verified endpoint: do not let automation kill or restart it. Quit manually only when safe, then retry doctor.
- Wrong App version or checksum: stop; do not bypass compatibility checks.
- `authentication: warn`: make one real run; doctor cannot verify credentials read-only.
- Provider connection returns `INTERNAL_ERROR`: inspect JiaorongAI account/provider state; v0.5.6 exposes only unstructured failure text.
- Missing Terminal Result: classify as transport/protocol failure, not a business result.
- Uninstall: `npm uninstall --global @jiaorong/cli`; App and Session data remain.
