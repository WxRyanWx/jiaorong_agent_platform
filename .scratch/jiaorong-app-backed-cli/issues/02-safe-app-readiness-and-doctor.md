# 02 — Prove safe JiaorongAI readiness with doctor

**What to build:** Make `jiaorong-cli doctor` prove whether the installed JiaorongAI application, loopback CDP endpoint, renderer target, version, bridge methods, required routes, and model readiness are safe to use without starting an agent turn.

**Blocked by:** 01 — Align product and conformance boundaries.

**Status:** ready-for-agent

**Resolution:** completed

- [x] Doctor succeeds against a conforming fake JiaorongAI endpoint and emits valid text and JSON diagnostics.
- [x] An absent application may be launched with loopback-only CDP arguments and is never terminated by the CLI.
- [x] An already-running application without CDP produces actionable failure and is not restarted.
- [x] Non-loopback, unrelated, ambiguous, malformed, oversized, timed-out, wrong-version, missing-route, and missing-event endpoints fail closed.
- [x] Public-process functional tests exercise the production entry point against a fake CDP/bridge server.
- [x] Security boundary and cleanup tests pass without exposing secrets or unrestricted paths.

## Architecture contract

App Runtime owns process and endpoint identity. CDP Client owns JSON-RPC transport. Doctor consumes their public readiness result and never reaches session creation.

## Expected proof

Unit boundary tests, negative endpoint tests, production-entry functional tests, and one real application doctor smoke when the environment is ready.

## Comments

### 2026-07-19 — completion evidence

- `npm test`: exit 0; 43 tests passed, 0 failed.
- `npm audit --json`: exit 0; 0 known vulnerabilities after updating the test-only `ws` dependency to 8.21.0.
- Real production command `./bin/jiaorong-cli.mjs doctor --output-format json`: exit 0; `ok=true`; installed app version `0.5.6`; endpoint `127.0.0.1:9238`; one available enabled model; all nine readiness checks passed.
- App identity is gated by bundle ID `com.wefonk.jiaorong`, exact bundle/bridge version `0.5.6`, exact executable path, listener PID and loopback bind, CDP product metadata, renderer URL/target identity, and a trusted bridge manifest pinned to upstream source revision `d2a7d3fe6a525a8b33633f8851afb44cf6ccc8c3`.
- The event boundary is intentionally version-manifest-based because JiaorongAI 0.5.6 `bridge.on` does not expose runtime event discovery. Runtime proves subscription and cleanup behavior and does not claim dynamic event discovery.
- Negative process tests cover non-loopback endpoints, unexpected owners, wrong Bundle ID/version, unrelated metadata, ambiguous/oversized targets, unsafe WebSocket URLs, missing route/subscription/method behavior, malformed/oversized/timed-out responses, disabled providers, and cleanup failure.
- A hung bridge invocation test installs three page listeners before hanging, then proves the renderer-local deadline removes all three (`activeSubscriptions=0`).
- `npm run conformance:fixture`: expected exit 1 because later tickets remain incomplete; `failed=0`, `required=101`, `executed=20`, `missing=81`. `CLI-002` doctor is now passing.
- Standards and spec re-reviews reported no remaining blocker.
