# 07 — Project tools and enforce non-interactive permissions

**What to build:** Project real JiaorongAI tool activity into correlated v1 events, automatically deny requests in default headless mode, and allow explicitly selected full-access runs without inventing terminal approval prompts.

**Blocked by:** 05 — Resume durable Sessions without cross-run interference.

**Status:** ready-for-agent

- [ ] Every observed Tool Call ID emits one tool_use and exactly one terminal tool_result.
- [ ] Tool success, failure, cancellation, large output, and agent recovery map to valid v1 events.
- [ ] Default Permission Mode rejects real permission interactions through the response bridge and never stalls for user input.
- [ ] Full access is opt-in and maps to JiaorongAI's verified permission mode.
- [ ] Unknown or unowned interactions fail closed and are never auto-approved.
- [ ] Relevant event, tool, and permission deterministic conformance cases pass.

## Architecture contract

The projector owns tool event state; the bridge owns interaction identity; the App Backend owns policy orchestration. No renderer or CLI parser performs tool-state inference.

## Expected proof

Tool snapshot tests, interaction-response process tests, negative ownership tests, large-output bounds, and one real observable Read tool smoke.
