# 08 — Stop real runs and enforce execution limits

**What to build:** Make Ctrl-C, timeout, and turn-limit termination stop the real JiaorongAI run, settle the original stream, clean up listeners, and produce one truthful Terminal Result.

**Blocked by:** 05 — Resume durable Sessions without cross-run interference; 07 — Project tools and enforce non-interactive permissions.

**Status:** ready-for-agent

**Resolution:** completed

- [x] First SIGINT requests remote stop using the exact current Session/request identity when known, or the exclusively locked Session while `chat.sendMessage` is still pending.
- [x] Stop acknowledgement alone does not release the Session; the original run must settle or fail with unproven cancellation.
- [x] Timeout follows the same stop-and-settle path and cannot merely close the local socket.
- [x] Turn limits produce the stable Machine Error Code and one Terminal Result.
- [x] Active tool calls receive valid cancelled terminal results when observable.
- [x] All listeners, buffers, timers, and CDP connections are released on every terminal path.
- [x] Relevant cancellation, timeout, and turn-limit deterministic conformance cases pass.

## Architecture contract

One terminal state machine owns run completion. Signal handlers may request transitions but cannot write output or release state independently.

## Expected proof

Signal-driven child-process tests, timeout races, duplicate-stop tests, resource cleanup canaries, and real Ctrl-C smoke.

## Comments

### 2026-07-20 — completion evidence

- Public-process tests cover exact request cancellation, send-pending Session cancellation, stream-terminal settlement, pinned persisted-terminal settlement, active file-tool cancellation, Edit before/after side effects, repeated SIGINT, caller SIGKILL after a non-settling run, timeout, and timeout/SIGINT races.
- SIGINT observed during stdin read, Attachment preflight, or backend preparation prevents the next lifecycle stage; an already-cancelled request cannot create/send a new App turn. Once cancellation or timeout is observed, the settlement deadline is narrowed to at most 30 seconds.
- A pending permission interaction observed after termination begins is never approved, including CLI `full_access`; already-published tools are closed by the projector with `CANCELLED` or `TIMEOUT`.
- The installed 0.5.6 source shows `chat.sendMessage` returns only after provider execution. The CLI therefore marks the renderer call as `invoking` and may stop the exclusively locked Session before request identity is returned. When the App publishes no terminal on AbortError, the fallback requires the same Session to be idle and its assistant message to contain the exact structured `common.error.userCanceledGeneration` error block.
- Real Ctrl-C smoke on JiaorongAI 0.5.6 Session `FiBvKSLfmOhLzgiSNimQ5` completed in 3,012 ms with exit 130, empty stderr, one result, `status=cancelled`, and `error.code=CANCELLED`.
- Deterministic cases `CAN-001`–`CAN-006`, `TIM-001`–`TIM-002`, and `TUR-001`–`TUR-002` pass. The first-release no-Shell decision changes CAN-002 to an active file-tool cancellation case.
- JiaorongAI 0.5.6 exposes one App Backend Headless Run turn and no max-step/tool-loop bridge control. `--max-turns >= 1` is therefore valid for real App runs but cannot interrupt internal tool-loop steps; the two-turn fixture proves only the generic CLI/backend `TURN_LIMIT` projection.
- Ticket 10 regression refresh: `npm test` passed 161/161. Independent negative tests separately prove the persisted-cancellation preexisting-ID, send timestamp, and latest-user `orderSeq` guards. A slow settlement bridge call is bounded by the remaining cancellation grace at both renderer and CDP request layers.
- SIGINT while stdin is blocked destroys the real Node `Readable`; SIGINT during Attachment preflight or backend preparation prevents the next stage, and a later stage error cannot replace `CANCELLED` before a run begins.
