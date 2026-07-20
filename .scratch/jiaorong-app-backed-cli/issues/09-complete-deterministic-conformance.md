# 09 — Complete the active deterministic conformance suite

**What to build:** Close every remaining active deterministic conformance gap, reject candidates that violate the v1 protocol, and make the official fixture conformance command return success with no active missing cases.

**Blocked by:** 04 — Discover models and report authentication readiness; 05 — Resume durable Sessions without cross-run interference; 06 — Send attachments inside explicit filesystem boundaries; 07 — Project tools and enforce non-interactive permissions; 08 — Stop real runs and enforce execution limits.

**Status:** ready-for-agent

**Resolution:** completed

- [x] Every case in the active deterministic inventory executes and has a current pass/fail result.
- [x] The active inventory excludes live-model scenarios and non-existent downstream-product integration scenarios without deleting their historical definitions.
- [x] Invalid candidates are rejected for Schema, ordering, correlation, exit-code, shell-safety, boundary, permission, concurrency, and cleanup violations.
- [x] The official fixture conformance command exits 0 with complete=true, failed=0, and missing=0.
- [x] The full repository test suite passes after coverage completion.

## Architecture contract

Conformance tests exercise public process I/O. Internal mocks may support fake JiaorongAI behavior but cannot replace candidate-process execution.

## Expected proof

Machine-readable conformance summary, exit code 0, full unit/integration output, and negative-candidate tests.

## Comments

### 2026-07-20 — completion evidence

- `npm run conformance:fixture`: exit 0; `ok=true`, `executedOk=true`, `complete=true`, `required=98`, `executed=98`, `missing=0`, `failed=0`; 99 total results include the non-inventory asset validation case.
- Newly executed gaps cover cancellation, compatibility, every Machine Error Code, invalid event state, preflight completeness, stderr separation, arbitrary UTF-8 byte chunks, non-JSON lines, and pretty multi-line JSON rejection.
- `npm test` after coverage completion passed 141/141; the subsequent retired-identity capacity and real cancellation fixes require the Ticket 10 current rerun before Feature acceptance.
- Ticket 10 supplied that rerun on 2026-07-20: `npm test` exited 0 with 161/161 passed, and `npm run conformance:fixture` again exited 0 with all 98 active IDs executed, 0 missing, and 0 failed.
