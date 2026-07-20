# 05 — Resume durable Sessions without cross-run interference

**What to build:** Let users resume a real JiaorongAI Session across CLI processes while concurrent runs keep events, locks, cancellation authority, and terminal states isolated.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** ready-for-agent

**Resolution:** completed

- [x] `--resume` validates and restores an existing JiaorongAI Session without replaying visible history from the CLI.
- [x] New and resumed runs preserve stable Session identity across separate processes.
- [x] Unknown or deleted Session IDs fail without creating replacement Sessions.
- [x] Concurrent runs use unique event buffers and accept only their own Session/request events.
- [x] A run cannot cancel, complete, or consume another run's stream.
- [x] Relevant Session and concurrency deterministic conformance cases pass.

## Architecture contract

JiaorongAI owns Session persistence. The bridge owns correlation; the CLI stores or forwards only stable Session IDs and never writes the database.

## Expected proof

Multi-process fake-bridge tests, cross-request adversarial events, real new/resume smoke, and Session persistence inspection through public bridge behavior.

## Comments

### 2026-07-19 — Resolution and current evidence

- Production behavior restores through `sessions.restore`, requires the exact persisted Session ID and provider/model pair, sends only the new prompt, and returns `INVALID_ARGUMENT`/42 for malformed, unknown, or deleted IDs without calling `sessions.create`.
- Renderer correlation uses a unique run token, a per-Session active-run lock, Session filtering, and a bounded retired request/message identity history. Different Sessions may run concurrently; a second run for the same Session fails before a second `chat.sendMessage` or any `chat.stopStream` call.
- Lock release is two-phase. Listener cleanup first reports terminal count, remaining events, overflow, and cleanup errors; only a fully validated success or correlated `chat.stream.failed` may release the matching token. Timeout, lost start response, late duplicate terminal, malformed/crossed events, and unsubscribe failure retain the Session lock.
- Deterministic public process tests prove new/resume continuity, new-prompt-only transmission, malformed/unknown/deleted failure, different-Session isolation, same-Session contention, retired-request rejection, failed-terminal recovery, cleanup-failure lock retention, and later state integrity after concurrent resume.
- Conformance: `required=101`, `executed=40`, `missing=61`, `failed=0`, `executedOk=true`, `complete=false`. Ticket 05 cases `SES-002`, `SES-003`, `SES-005`, `SES-006`, and `SES-010` pass; `SES-006` now creates then removes fixture state before restore, and repeated unknown/deleted attempts prove no replacement Session is created.
- Full repository tests passed 93/93. Every `.mjs` passed `node --check`; `npm audit --json` reported zero vulnerabilities; `git diff --check 66dae91` passed.
- Real JiaorongAI 0.5.6 smoke used two separate CLI processes with Session `RtU8KeRGthnYKH2jd2ZHb`: the first stored `JRCLI_T05_FINAL_719`; the resumed run returned `resumed=true`, the same Session ID, and exact content `JRCLI_T05_FINAL_719` without history replay from the CLI.
- Independent Standards and Spec re-reviews reported no remaining blocker and no scope creep. The later Feature-boundary regression adds a dedicated 16,384 retired-identity saturation test and proves fail-closed behavior before send with no listener leak.
