# 07 — Project tools and enforce non-interactive permissions

**What to build:** Project real JiaorongAI tool activity into correlated v1 events, automatically deny requests in default headless mode, and allow explicitly selected full-access runs without inventing terminal approval prompts.

**Blocked by:** 05 — Resume durable Sessions without cross-run interference.

**Status:** ready-for-agent

**Resolution:** completed

- [x] Every observed Tool Call ID emits one tool_use and exactly one terminal tool_result.
- [x] Tool success, failure, large output, and agent recovery map to valid v1 events. Active-tool cancellation is owned by Ticket 08.
- [x] Default Permission Mode rejects real permission interactions through the response bridge and never stalls for user input.
- [x] Full access is opt-in; JiaorongAI remains in `default`, while App Backend grants only correlated, schema-valid operations proven inside Project Root or an Additional Directory.
- [x] Unknown or unowned interactions fail closed and are never auto-approved.
- [x] `exec` and `process` are disabled when a CLI Session is created, and resume rejects Sessions where either tool is enabled.
- [x] Each run clears prior per-Session approvals before send and after a validated terminal state; a reset failure or non-idle Session fails closed before send.
- [x] Relevant event, tool, and permission deterministic conformance cases pass.

## Architecture contract

The projector owns tool event state and validates permission metadata; the bridge owns interaction identity; the App Backend owns policy orchestration. JiaorongAI always remains in `default`, and CLI Sessions disable `exec`/`process` because 0.5.6 can execute low-risk-classified commands without any permission interaction. No renderer or CLI parser performs tool-state inference. Accepted ADR 0019 governs the replacement for the unsafe native `full_access` mapping; product confirmed the first-release no-Shell limit on 2026-07-19.

## Expected proof

Tool snapshot tests, interaction-response process tests, Additional Directory approval, cross-run cache isolation, reset-failure and non-idle rejection, outside-root and unknown-tool denial, disabled-Shell and unsafe-resume tests, negative ownership tests, large-output bounds, and one real observable Read tool smoke.

## Comments

### 2026-07-19 — current completion evidence

- `npm test`: exit 0; 136 tests passed, 0 failed on the integrated working tree.
- `node ./bin/jiaorong-cli-conformance.mjs --binary ./tests/fixtures/conformant-cli.mjs --protocol 1`: expected exit 1 because the Feature inventory remains incomplete; `executedOk=true`, `failed=0`, `required=98`, `executed=69`, `missing=29`, `complete=false`. All active `PER-*` and `TOL-*` cases executed by Ticket 07 passed; Shell cases `TOL-004`–`TOL-006` are Deferred under ADR 0019.
- Real `doctor`: exit 0; JiaorongAI 0.5.6 at `127.0.0.1:9238`; pinned bundle accepted; ten readiness checks reported (`authentication` remains the documented pre-run warning).
- Real App Session `ntt9Omd_1qNyElg0i9EWJ`: a `full_access` run with `/Users/miemie/Documents/jiaorong-cli-ticket07-review-20260719` as an Additional Directory emitted one correlated `read` tool_use/tool_result with `status=success`. The next run on the same Session omitted `--add-dir`, emitted a fresh `read`, and returned `PERMISSION_DENIED`. The one-use canary and its empty directory were removed afterward.
- The real smoke first exposed that JiaorongAI 0.5.6 includes `rememberable: true` in its normalized file permission request. A regression test now preserves that exact known field while rejecting `command` and arbitrary unknown fields in file permission schemas. The original real Additional Directory scenario then passed.
- Independent review findings for mixed safe/outside targets, missing disabled-tool readiness, false Shell Conformance, private tool-output fields, serialized 16 KiB limits, open permission schemas, renderer-deadline reset, and delayed preflight continuing after its deadline were resolved with automated regression coverage.
- Residual limits remain those accepted in ADR 0019: `restore(status=idle)` and `chat.stopStream` are not atomic; `stopped=true` cannot independently attest to the internal clear; Session history may repeat previously authorized content. Feature acceptance and Release remain No-Go while 29 deterministic cases and later Tickets are incomplete.

### 2026-07-20 — regression refresh

- `npm test`: exit 0; 161/161 passed on the integrated Ticket 10 source.
- Project Root setup now requires `sessions.setProjectDir` to return the exact requested `projectDir`; Permission Mode setup is read back through `sessions.getPermissionMode` and must equal `default`. Crossed readback process tests fail before prompt send.
- The pinned 0.5.6 `read`/`write`/`edit`/`glob`/`grep` input schemas are closed: unknown top-level and nested keys deny approval. The accepted keys and scalar constraints were taken from the verified 0.5.6 bundle source rather than inferred.
- Permission decisions no longer invoke the response route directly. The renderer run state serializes cancellation and `chat.respondToolInteraction`; cancellation committed first prevents a later grant. A process test cancels during delayed full-access Edit policy validation and observes zero interaction responses.
- The prior real Read smoke remains evidence for the pinned 0.5.6 behavior tested on 2026-07-19. It is not evidence for an installed Release candidate; Ticket 11 must repeat the applicable live checks against the exact artifact.
