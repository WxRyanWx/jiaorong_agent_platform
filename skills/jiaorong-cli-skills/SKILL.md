---
name: jiaorong-cli-skills
description: Use when a user or automation task involves the installed `jiaorong-cli` v0.1.0 or terminal access to JiaorongAI.app, including prompts, doctor/readiness, model discovery, Sessions/resume, text Attachments, Additional Directories, permission modes, text/json/stream-json output, tool events, cancellation, timeout, Machine Error Codes, or CLI usage teaching.
---

# Jiaorong CLI Skills

Run real JiaorongAI turns from the terminal without modifying JiaorongAI or reimplementing its runtime.

## Establish readiness

1. Confirm the command and supported version:

   ```bash
   command -v jiaorong-cli
   jiaorong-cli --version
   ```

2. Run the read-only readiness check:

   ```bash
   jiaorong-cli doctor --output-format json
   ```

3. Require `ok: true`, JiaorongAI `0.5.6`, a loopback endpoint, and at least one available model. Treat `authentication: warn` as expected until an actual run checks the Provider.
4. Discover the exact provider-qualified Model ID; never guess it from the display name:

   ```bash
   jiaorong-cli models list --output-format json
   ```

**REQUIRED REFERENCE:** Read [references/command-reference.md](references/command-reference.md) completely before constructing an unfamiliar command, writing a machine-output consumer, or diagnosing a failure. Do not load it for a simple version/readiness check or an ordinary text run whose flags are already shown below.

## Choose the execution shape

| Need | Output |
|---|---|
| Human-readable final prose only | `text` |
| One script-consumable terminal object | `json` |
| Progress, tool correlation, cancellation, or Session capture | `stream-json` |

- Use `-p` for a short prompt. Pipe stdin for long or generated input.
- Start a new Agent Session when no `--resume` is supplied. Preserve the returned `sessionId` for continuation.
- Resume only the Session explicitly provided by the user or the immediately preceding successful run.

Prefer this automation-safe shape:

```bash
jiaorong-cli \
  -p 'Perform the requested task' \
  --model '<provider-qualified-model-id>' \
  --output-format stream-json \
  --timeout 300
```

## Set filesystem authority deliberately

Treat the process working directory as the Project Root. Run the command from the narrowest directory that contains the authorized task files.

- Do not use a broad home directory or filesystem root as the Project Root.
- Add each required external directory with a separate absolute `--add-dir`.
- Attach each explicit text file with a separate `--file`.
- Do not interpolate file contents or paths into the prompt as a substitute for `--file` or `--add-dir`.
- Keep image Attachment out of first-release workflows. Its structural path exists, but real image recognition was waived and is not verified.

Use `default` unless the requested task needs a correlated file permission interaction. Use `full_access` only for trusted local work whose writes or external-directory reads are explicitly authorized:

```bash
jiaorong-cli \
  -p 'Update the authorized project files' \
  --permission-mode full_access \
  --add-dir '/absolute/authorized-directory' \
  --output-format stream-json
```

`full_access` never removes the Project Root or Additional Directory boundary. Shell and background-process tools remain disabled in every mode. Never promise or request Shell through this CLI.

## Fail closed on unsafe shortcuts

- **Never run a file task from `/` or a broad home directory to avoid declaring scope.** The working directory is the Project Root, so this silently grants a much wider boundary than the task requires.
- **Never guess a Model ID or persist a display name.** Provider-qualified IDs are the stable selectors; availability can change.
- **Never treat `full_access` as unrestricted filesystem access.** It approves only correlated built-in file requests inside Project Root or explicit Additional Directories.
- **Never merge stderr into JSON/JSONL stdout.** Diagnostics would corrupt the machine protocol.
- **Never infer success from a generated sentence, a tool result, or process termination alone.** The unique Terminal Result plus the matching exit code is authoritative.
- **Never use image Attachment or Shell as a fallback.** Real image recognition is waived in v1, while Shell is disabled because the pinned App could execute it outside the verified permission interaction path.

## Consume results correctly

For `json`, parse exactly one JSON object and require both exit `0` and `status: "success"`.

For `stream-json`:

1. Parse stdout one JSON object per line.
2. Require one first `init` event and record its `requestId`, `sessionId`, model, and attachments.
3. Accumulate `message.delta` values for display only.
4. Correlate each `tool_use` with exactly one `tool_result` by `toolCallId`.
5. Treat the unique final `result` as authoritative.
6. Keep stderr separate from protocol stdout.
7. Treat a missing `result` as a protocol/transport failure, never as success.

Do not expose `reasoning_summary` as raw chain of thought. It is optional display text only.

## Preserve Session safety

- Save the successful `sessionId`; the CLI does not provide Session listing or deletion commands in v1.
- Continue with `--resume '<session-id>'`; send only the new prompt.
- Do not run two CLI processes against the same Session concurrently.
- Do not use the same Session concurrently in JiaorongAI desktop and the CLI.
- Remember that removing an earlier `--add-dir` blocks new access but does not erase content already retained in Session history.

## Handle cancellation and failures

- Use one Ctrl-C to request a real remote stop and wait up to the 30-second settlement grace.
- Use a second Ctrl-C only for forced local exit; then do not claim remote cancellation was confirmed.
- Set `--timeout <seconds>` for unattended work.
- Treat `--max-turns` as a v1 compatibility argument: App Backend performs one Headless Run turn, and the flag does not limit JiaorongAI's internal tool loop.

Branch on Machine Error Code, not message prose. Never retry `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `UNSUPPORTED_ATTACHMENT`, `TURN_LIMIT`, or `CANCELLED` unchanged. Retry `MODEL_UNAVAILABLE` with backoff after refreshing the catalog. Retry `INTERNAL_ERROR` at most once after `doctor`, unless the operation may have non-idempotent effects.

## Correct common mistakes

| Mistake | Correction |
|---|---|
| Treating Doctor `authentication: warn` as login failure | Make one real short run; v0.5.6 has no read-only credential-validity signal. |
| Using `text` in automation | Use `json` or `stream-json` to retain status, error, and Session identity. |
| Reusing a Session concurrently | Wait for its active run and avoid simultaneous desktop use. |
| Removing `--add-dir` and assuming old knowledge vanished | Start a fresh Session when previously learned external content must not remain in context. |
| Retrying timeout/internal failure blindly | Check possible file side effects and retry only when safe. |

## Report the run

Return the command shape, exit code, Terminal Result status, Machine Error Code when present, Session ID, and any material tool outcomes. State skipped or waived capabilities explicitly. Never report image recognition, Shell, another JiaorongAI version, or another platform as verified for v0.1.0.
