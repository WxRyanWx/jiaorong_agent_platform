# 06 — Send attachments inside explicit filesystem boundaries

**What to build:** Let users attach supported text and image files while the CLI validates real paths, symlinks, type, size, Project Root, and Additional Directory permissions before any Session side effect.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** ready-for-agent

- [ ] Repeatable structured attachment and Additional Directory arguments are parsed without prompt interpolation.
- [ ] Missing, unreadable, oversized, unsupported, traversal, symlink-escape, and out-of-bound files fail before Session creation.
- [ ] Accepted attachments are prepared through JiaorongAI and their safe metadata appears in init.
- [ ] Text and image attachment payloads reach the real send-message bridge in the expected shape.
- [ ] Relevant attachment and filesystem deterministic conformance cases pass.

## Architecture contract

The CLI owns authorization boundaries and preflight order; JiaorongAI owns file preparation. No raw file content enters JSONL protocol output.

## Expected proof

Temporary-filesystem boundary tests, bridge payload process tests, preflight side-effect canaries, and real text/image attachment smoke.
