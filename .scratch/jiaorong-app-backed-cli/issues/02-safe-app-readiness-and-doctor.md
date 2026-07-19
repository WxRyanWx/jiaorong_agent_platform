# 02 — Prove safe JiaorongAI readiness with doctor

**What to build:** Make `jiaorong-cli doctor` prove whether the installed JiaorongAI application, loopback CDP endpoint, renderer target, version, bridge methods, required routes, and model readiness are safe to use without starting an agent turn.

**Blocked by:** 01 — Align product and conformance boundaries.

**Status:** ready-for-agent

- [ ] Doctor succeeds against a conforming fake JiaorongAI endpoint and emits valid text and JSON diagnostics.
- [ ] An absent application may be launched with loopback-only CDP arguments and is never terminated by the CLI.
- [ ] An already-running application without CDP produces actionable failure and is not restarted.
- [ ] Non-loopback, unrelated, ambiguous, malformed, oversized, timed-out, wrong-version, missing-route, and missing-event endpoints fail closed.
- [ ] Public-process functional tests exercise the production entry point against a fake CDP/bridge server.
- [ ] Security boundary and cleanup tests pass without exposing secrets or unrestricted paths.

## Architecture contract

App Runtime owns process and endpoint identity. CDP Client owns JSON-RPC transport. Doctor consumes their public readiness result and never reaches session creation.

## Expected proof

Unit boundary tests, negative endpoint tests, production-entry functional tests, and one real application doctor smoke when the environment is ready.
