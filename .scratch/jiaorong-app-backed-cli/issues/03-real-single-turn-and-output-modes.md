# 03 — Run a real single turn in every output mode

**What to build:** Let users run one real JiaorongAI prompt through the production CLI, create a durable Session, stream validated text and reasoning deltas, and finish with consistent text, JSON, or stream-json output.

**Blocked by:** 02 — Prove safe JiaorongAI readiness with doctor.

**Status:** ready-for-agent

- [ ] Argument and stdin prompts reach the bridge unchanged, including Unicode, newlines, quotes, and shell metacharacters.
- [ ] A successful run creates a real Session before sending the prompt and returns the same non-empty Session ID in init and result.
- [ ] Snapshot projection emits monotonic message and reasoning deltas and exactly one Terminal Result.
- [ ] Text, JSON, and stream-json describe the same successful outcome and preserve stdout/stderr separation.
- [ ] Bridge failures, malformed snapshots, duplicate terminals, and lost event correlation fail explicitly.
- [ ] Production-process functional tests and relevant deterministic conformance cases pass.

## Architecture contract

The App Backend is the sole JiaorongAI-to-v1 translator. CLI parsing/rendering stay bridge-agnostic; the projector owns snapshot state.

## Expected proof

Fake-bridge process tests, projector unit tests, protocol Schema validation, and a real one-turn smoke later reused by Release.
