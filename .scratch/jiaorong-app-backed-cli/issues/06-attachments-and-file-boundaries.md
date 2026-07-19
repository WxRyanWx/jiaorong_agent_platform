# 06 — Send attachments inside explicit filesystem boundaries

**What to build:** Let users attach supported text and image files while the CLI validates real paths, symlinks, type, size, Project Root, and Additional Directory permissions before any Session side effect.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** resolved

- [x] Repeatable structured attachment and Additional Directory arguments are parsed without prompt interpolation.
- [x] Missing, unreadable, oversized, unsupported, traversal, symlink-escape, and out-of-bound files fail before Session creation.
- [x] Accepted attachments are prepared through JiaorongAI and their safe metadata appears in init.
- [x] Text and image attachment payloads reach the real send-message bridge in the expected shape.
- [x] Relevant attachment and filesystem deterministic conformance cases pass.

## Architecture contract

The CLI owns authorization boundaries and preflight order; JiaorongAI owns file preparation. No raw file content enters JSONL protocol output.

## Expected proof

Temporary-filesystem boundary tests, bridge payload process tests, preflight side-effect canaries, and real text/image attachment smoke.

## Comments

### 2026-07-19 — Implementation and current evidence

- Public CLI preflight canonicalizes the Project Root, Additional Directories, and Attachment paths before the App Backend is opened. It rejects missing/unreadable/non-file paths, traversal, root escape, symlink escape, macOS Finder aliases, unsupported MIME, count/size limits, and invalid directories. Negative process tests assert an empty bridge invocation list and no Session creation.
- Published limits are 16 Attachments, 16 Additional Directories, 30 MiB per Attachment, 60 MiB total source size, and 4,096 UTF-8 bytes per supplied path. Oversized totals fail after stat checks and before any file body is read.
- Installed JiaorongAI 0.5.6 contract was verified read-only from `app.asar`: `file.prepareFile({ path, mimeType }) -> { file }`; file turns use `chat.sendMessage({ sessionId, content: { text, files } })`.
- Prepared file bodies remain in a renderer-local, one-use token store so text/image content does not cross the CLI's 512 KiB CDP response boundary or enter `init`. Host validation compares returned basename, canonical path, MIME, and byte size before Session creation; every success/failure path discards the token.
- `npm test` passed 113/113. Deterministic Conformance passed `FIL-001` through `FIL-005`, `FIL-008`, and `ATT-001` through `ATT-008`; current inventory is `required=101`, `executed=54`, `missing=47`, `failed=0`, `executedOk=true`, `complete=false`.
- Real JiaorongAI text smoke exited 0 with Session `AJtQ-UXoHfAByDqmkwJY9`, safe `CONTEXT.md` metadata, and a model-visible top-level title. Real PNG smoke exited 0 with Session `O-f-TmbD4me7kooODhjuE`, safe `finder.png` metadata, and a correct Finder-icon description when run with explicit `bypassPermissions` and a prompt that prohibited tool calls so the smoke isolated the Attachment seam.
- Diagnostic boundary: in `default` mode the real model may choose a `read` tool and JiaorongAI emits `tool_call` plus `tool_call_permission`. Automatic non-interactive denial and tool event projection belong to Ticket 07; Ticket 06 does not bypass or silently discard that permission interaction.
