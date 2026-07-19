# 03 — Run a real single turn in every output mode

**What to build:** Let users run one real JiaorongAI prompt through the production CLI, create a durable Session, stream validated text and any explicitly safe Reasoning Summary, and finish with consistent text, JSON, or stream-json output.

**Blocked by:** 02 — Prove safe JiaorongAI readiness with doctor.

**Status:** ready-for-agent

- [x] Argument and stdin prompts reach the bridge unchanged, including Unicode, newlines, quotes, and shell metacharacters.
- [x] A successful run creates a real Session before sending the prompt and returns the same non-empty Session ID in init and result.
- [x] Snapshot projection emits monotonic message deltas, never exposes JiaorongAI 0.5.6 raw `reasoning_content` as a summary, and emits exactly one Terminal Result.
- [x] Text, JSON, and stream-json describe the same successful outcome and preserve stdout/stderr separation.
- [x] Bridge failures, malformed snapshots, duplicate terminals, and lost event correlation fail explicitly.
- [x] Production-process functional tests and relevant deterministic conformance cases pass.

## Architecture contract

The App Backend is the sole JiaorongAI-to-v1 translator. CLI parsing/rendering stay bridge-agnostic; the projector owns snapshot state.

## Expected proof

Fake-bridge process tests, projector unit tests, protocol Schema validation, and a real one-turn smoke later reused by Release.

## Comments

### 2026-07-19 implementation evidence

- The production App Backend now creates an empty durable Session with the sole verified provider/model pair, installs a bounded renderer-local event buffer, then sends the prompt exactly once through `chat.sendMessage`.
- Fake-bridge process coverage proves argv/stdin preservation, text/json/stream-json equivalence, nullable send acknowledgements, authoritative request correlation before output, malformed snapshots, unsupported blocks, duplicate and late terminals, buffer overflow, UTF-8 size limits, lost start responses, and listener cleanup.
- CLI preflight bounds stdin while reading and rejects prompts over 128 KiB before the backend seam. Bridge start payloads carry the prompt as UTF-8 Base64 so JSON escaping cannot exceed the bounded CDP request while the renderer receives the original text.
- Public deterministic conformance now executes Ticket 03 cases `EVT-001`, `EVT-002`, `EVT-008`, `EVT-010`, `EVT-011`, `EVT-016`, `SES-001`, `ERR-002`, and `ERR-003`.
- Current verification: `npm test` passes 63/63; deterministic conformance has `executedOk=true`, 29 executed, 72 missing, and 0 failed, so `complete=false`; `npm audit --json` reports 0 vulnerabilities; module syntax and `git diff --check` pass.
- Direct source verification at upstream revision `d2a7d3fe6a525a8b33633f8851afb44cf6ccc8c3` shows `reasoning_content` is rendered and optionally copied as CoT. ADR 0006 therefore requires suppressing it; JiaorongAI 0.5.6 exposes no separate safe summary source.
- Real `doctor` passed for JiaorongAI 0.5.6 and one available model. The earlier `providers.testConnection` timeout was rechecked on 2026-07-19 and returned `isOk=true` for `jiaorong/jiaorong-deepseek-v4-pro`.
- A real stream-json run passed with Session `wYnb5hmpU9xP9YiPkql4I`: exit 0, empty stderr, valid v1 Schema, matching non-empty init/result Session IDs, non-empty content, no error event, and exactly one Terminal Result. Separate real text and JSON runs both exited 0 with empty stderr and non-empty content; the JSON document was Schema-valid with `status=success` and Session `G7FiMJQu4jBHk862nkEBq`.
- Two diagnostic prompts produced model-selected `tool_call` blocks and correctly failed closed because tool projection belongs to Ticket 07. A redacted bridge trace proved all observed events belonged to one Session/request/message, and the diagnostic run was explicitly stopped; no temporary instrumentation remains.
