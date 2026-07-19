# 08 — Stop real runs and enforce execution limits

**What to build:** Make Ctrl-C, timeout, and turn-limit termination stop the real JiaorongAI run, settle the original stream, clean up listeners, and produce one truthful Terminal Result.

**Blocked by:** 05 — Resume durable Sessions without cross-run interference; 07 — Project tools and enforce non-interactive permissions.

**Status:** ready-for-agent

- [ ] First SIGINT requests remote stop using the exact current Session/request identity.
- [ ] Stop acknowledgement alone does not release the Session; the original run must settle or fail with unproven cancellation.
- [ ] Timeout follows the same stop-and-settle path and cannot merely close the local socket.
- [ ] Turn limits produce the stable Machine Error Code and one Terminal Result.
- [ ] Active tool calls receive valid cancelled terminal results when observable.
- [ ] All listeners, buffers, timers, and CDP connections are released on every terminal path.
- [ ] Relevant cancellation, timeout, and turn-limit deterministic conformance cases pass.

## Architecture contract

One terminal state machine owns run completion. Signal handlers may request transitions but cannot write output or release state independently.

## Expected proof

Signal-driven child-process tests, timeout races, duplicate-stop tests, resource cleanup canaries, and real Ctrl-C smoke.
