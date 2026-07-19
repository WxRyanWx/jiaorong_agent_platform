# 05 — Resume durable Sessions without cross-run interference

**What to build:** Let users resume a real JiaorongAI Session across CLI processes while concurrent runs keep events, locks, cancellation authority, and terminal states isolated.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** ready-for-agent

- [ ] `--resume` validates and restores an existing JiaorongAI Session without replaying visible history from the CLI.
- [ ] New and resumed runs preserve stable Session identity across separate processes.
- [ ] Unknown or deleted Session IDs fail without creating replacement Sessions.
- [ ] Concurrent runs use unique event buffers and accept only their own Session/request events.
- [ ] A run cannot cancel, complete, or consume another run's stream.
- [ ] Relevant Session and concurrency deterministic conformance cases pass.

## Architecture contract

JiaorongAI owns Session persistence. The bridge owns correlation; the CLI stores or forwards only stable Session IDs and never writes the database.

## Expected proof

Multi-process fake-bridge tests, cross-request adversarial events, real new/resume smoke, and Session persistence inspection through public bridge behavior.
