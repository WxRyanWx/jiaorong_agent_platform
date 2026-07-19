# 09 — Complete the active deterministic conformance suite

**What to build:** Close every remaining active deterministic conformance gap, reject candidates that violate the v1 protocol, and make the official fixture conformance command return success with no active missing cases.

**Blocked by:** 04 — Discover models and report authentication readiness; 05 — Resume durable Sessions without cross-run interference; 06 — Send attachments inside explicit filesystem boundaries; 07 — Project tools and enforce non-interactive permissions; 08 — Stop real runs and enforce execution limits.

**Status:** ready-for-agent

- [ ] Every case in the active deterministic inventory executes and has a current pass/fail result.
- [ ] The active inventory excludes live-model scenarios and non-existent downstream-product integration scenarios without deleting their historical definitions.
- [ ] Invalid candidates are rejected for Schema, ordering, correlation, exit-code, shell-safety, boundary, permission, concurrency, and cleanup violations.
- [ ] The official fixture conformance command exits 0 with complete=true, failed=0, and missing=0.
- [ ] The full repository test suite passes after coverage completion.

## Architecture contract

Conformance tests exercise public process I/O. Internal mocks may support fake JiaorongAI behavior but cannot replace candidate-process execution.

## Expected proof

Machine-readable conformance summary, exit code 0, full unit/integration output, and negative-candidate tests.
