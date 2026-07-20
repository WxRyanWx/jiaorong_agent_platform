# 10 — Pass full regression and resolve review findings

**What to build:** Prove the complete Feature stays correct across public CLI behavior, security boundaries, process lifecycle, protocol compatibility, and documentation, then resolve every blocking review finding.

**Blocked by:** 09 — Complete the active deterministic conformance suite.

**Status:** ready-for-agent

**Resolution:** completed

- [x] Static checks, full tests, deterministic conformance, functional process tests, negative boundaries, and targeted regressions pass from the current source revision.
- [x] Product documentation, command help, ADRs, protocol docs, and installation instructions match actual behavior.
- [x] A substantive review compares against the approved Feature baseline and fixed pre-Feature commit.
- [x] All blocking findings are fixed and affected checks are rerun.
- [x] Skipped live checks or known defects are explicit and block Release unless waived.

## Architecture contract

Review reopens architecture when implementation crosses an unapproved layer, duplicates JiaorongAI state, weakens fail-closed behavior, or cannot be tested at the public process seam.

## Expected proof

Full command log, diff review findings and resolutions, current documentation checks, and verification-before-completion evidence.

## Comments

### 2026-07-20 — completion evidence

- Fixed comparison point: `43c092484fd40285ad64833c5771774e3f636104` on branch `codex/jiaorong-app-backed-cli`. No commit or push was made.
- Standard full regression: `npm test`, exit 0, 161 tests passed, 0 failed, 0 skipped. One earlier attempt ran `npm test` concurrently with the full conformance suite and the public runner crossed its 5-second harness timeout at 5.03 seconds; the conformance command and the other 160 tests passed. The required standard command was then rerun alone and passed 161/161 in 8.28 seconds.
- Deterministic conformance: `npm run conformance:fixture`, exit 0; `ok=true`, `executedOk=true`, `complete=true`, `required=98`, `executed=98`, `missing=0`, `failed=0`. The 99th reported pass is `ASSET-001`, outside the active-ID count.
- Static and dependency checks: every `.mjs` under `bin`, `conformance`, `fixtures`, `protocol`, `src`, and `tests` passed `node --check`; `git diff --check` passed; `npm audit --json` reported 0 vulnerabilities at every severity.
- Spec and standards reviews compared the complete working tree against the fixed baseline. Resolved findings include exact Project Root and Permission Mode readback, closed pinned-tool schemas, cancellation/permission serialization, early SIGINT and stdin destruction, hard cancellation-grace bounding, independent persisted-cancellation guards, honest one-turn App semantics, and removal of the stale Workbuddian cancellation subject. Final reviewers reported no remaining code Blocker or High.
- Accepted nonblocking maintainability observations remain: `deepchat-bridge.mjs` is large, bridge allowlists repeat across modules, and conformance fixtures contain repeated marker switches. They do not weaken the verified contracts and are not expanded into a pre-Release refactor.
- Current-source real JiaorongAI smoke was deliberately not rerun inside Ticket 10. Prior development smoke proved real 0.5.6 Read behavior and Ctrl-C, but cannot substitute for the exact installed candidate. Ticket 11 remains the Release gate for doctor, models, output modes, real run/resume, Attachment, Additional Directory Read, Ctrl-C, install, and uninstall/rollback.
