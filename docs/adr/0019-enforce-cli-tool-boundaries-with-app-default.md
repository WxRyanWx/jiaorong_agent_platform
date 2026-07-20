# Enforce CLI tool boundaries while JiaorongAI remains in default mode

Status: Accepted
Authority: Product acceptance confirmed by the user
Date: 2026-07-19
Affected baseline: `.scratch/jiaorong-app-backed-cli/spec.md`, Ticket 07, and the v1 permission protocol

## Context

The approved App Backend initially mapped CLI `full_access` directly to JiaorongAI 0.5.6 `full_access`. A live boundary canary then proved that the application could read a file outside the configured Project Root. That mapping violates the v1 invariant that `full_access` never removes the Project Root and Additional Directory boundary.

Read-only inspection of the installed 0.5.6 `app.asar` established that the application exposes structured permission requests for its built-in `read`, `write`, `edit`, `glob`, `grep`, and `exec` tools. File requests include a permission type and canonical paths. Command requests include the command, signature, and command metadata. Granting a file request adds that concrete path to JiaorongAI's session permission service. A later live canary proved a stronger Shell failure: JiaorongAI executed `cat /tmp/...` without emitting any permission interaction, so interaction policy cannot mediate all commands before their side effects.

The same inspection proved that file approvals persist in a per-Session cache across Headless Runs. JiaorongAI 0.5.6 exposes no dedicated permission-cache reset route. Its public `chat.stopStream` route clears the cache and cancels generation in parallel, while its public `{ stopped: true }` result does not independently attest to the internal clear. The pinned 0.5.6 bundle implements the clear as synchronous deletion from its permission maps.

## Options considered

1. Continue mapping CLI `full_access` to App `full_access`. This is simple but fails the proven hard boundary.
2. Reject every CLI `full_access` run or every run with `--add-dir`. This is safe but removes an approved v1 capability even where the application supplies enough structured evidence to enforce it.
3. Keep JiaorongAI in `default` and let App Backend approve only owned, correlated requests whose scope the CLI can prove. This preserves the hard boundary and delegates actual tool execution to JiaorongAI.

## Decision

Select option 3.

- New and resumed JiaorongAI Sessions are always configured with App Permission Mode `default`.
- CLI `default` denies every real permission interaction immediately through `chat.respondToolInteraction` and never waits on terminal input.
- CLI `full_access` may grant only a pending built-in interaction whose action type, Tool Call ID, tool name, permission type, server, structured request, and tool input agree.
- File targets are resolved canonically and must be contained by the Project Root or an explicit Additional Directory. Symlink escape, crossed target data, unknown tools, unknown schemas, missing targets, and outside paths are denied.
- JiaorongAI executes every granted tool and owns its session permission cache. The CLI does not implement file or shell tools.
- The App Backend accepts only the pinned `app.asar` build whose permission-clear implementation was inspected. Inside the renderer Session lock, it rechecks that the Session is `idle`, then calls `chat.stopStream` before subscribing or sending to clear prior approvals. It calls the same route again after a validated terminal state and listener removal. A non-idle Session is rejected without calling stop; a failed or invalid reset blocks prompt sending or lock release.
- Every CLI-created Session persists `exec` and `process` in `disabledAgentTools`. Resume accepts only a Session that still has both tools disabled. Shell and background processes are therefore unavailable in the 0.5.6 App Backend.

## Consequences

- Native App `full_access` is no longer reachable from Jiaorong CLI v1.
- A concrete file operation in an Additional Directory can work through JiaorongAI's real permission and tool flow without widening the Project Root.
- Shell capability is removed from this App Backend candidate. Broader Shell support requires an execution-time boundary that can be independently verified.
- Permission snapshots and policy decisions require deterministic structural, correlation, canonical-path, unknown-tool, and negative-boundary tests plus live canaries.
- Removing an Additional Directory prevents new access but does not erase tool results already persisted in Agent Session history. The model may repeat content learned during an earlier authorized run.
- The `idle` check and `chat.stopStream` call are not atomic. Callers must not run the same Agent Session concurrently in JiaorongAI desktop and Jiaorong CLI; a desktop turn that starts in that race window may be cancelled. A dedicated atomic upstream permission-reset route would be required to remove this residual risk.
- Session setup no longer needs a later Permission Mode restore, reducing cross-run configuration races.

## Supersession and reversal

This ADR supersedes the direct App `full_access` mapping, the `full_access + --add-dir` preflight rejection, and Shell support previously stated in the Feature Spec, Ticket 07, protocol, and README. It extends ADR 0018 without changing its App Backend ownership boundary. Reversal requires a new supported JiaorongAI version or backend that proves execution-time Project Root and Additional Directory enforcement for every granted tool.
