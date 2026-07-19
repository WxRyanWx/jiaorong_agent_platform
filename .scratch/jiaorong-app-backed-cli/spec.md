Status: ready-for-agent

# JiaorongAI App-Backed CLI

## Problem Statement

JiaorongAI users currently have a desktop application but no verified command-line interface for running real JiaorongAI agent turns from scripts, terminals, or automation. The existing Jiaorong CLI repository contains a versioned machine protocol, deterministic fixtures, a command parser, and a test backend, but its production entry point deliberately uses an unavailable backend and therefore cannot run a real prompt.

The CLI must become genuinely usable without modifying the JiaorongAI source repository or creating a second implementation of JiaorongAI providers, sessions, tools, skills, authentication, and persistence. The delivered CLI must be functionally proven, packaged as a reproducible release candidate, installed locally, and tested through that installed command. Claims that cannot be verified against the real application must remain explicitly unverified.

## Solution

Deliver a macOS Jiaorong CLI that treats the installed JiaorongAI application as its real backend. The CLI will safely start or connect to JiaorongAI through an Electron CDP endpoint restricted to loopback, validate the application and bridge contract, call the existing preload bridge for sessions, models, attachments, agent execution, tools, cancellation, and interaction responses, and project the resulting snapshots into the published v1 text, JSON, and streaming JSON outputs.

The first release will require JiaorongAI 0.5.6 to be installed. It may launch an absent application with a verified loopback debugging endpoint, but it will never silently stop, replace, or restart an already-running application. The CLI will preserve the existing protocol boundary so that a future native headless JiaorongAI runtime can replace the application-backed adapter without changing CLI consumers.

## User Stories

1. As a JiaorongAI user, I want to run a prompt from the terminal, so that I can use JiaorongAI outside the desktop chat UI.
2. As a shell user, I want to provide a prompt as an argument, so that simple invocations remain concise.
3. As an automation author, I want to provide a prompt through stdin, so that I can safely pipe arbitrary text without shell interpolation.
4. As a human user, I want readable text output, so that I can use the CLI interactively.
5. As a script author, I want a single JSON result, so that I can consume a completed run deterministically.
6. As a streaming client, I want newline-delimited JSON events, so that I can render progress without parsing terminal formatting.
7. As a user, I want a new run to return a durable Session ID, so that I can continue the same conversation later.
8. As a user, I want to resume an existing Session ID, so that context persists across independent CLI processes.
9. As a user, I want sessions created by the CLI to use JiaorongAI's real persistence, so that the desktop application and CLI observe the same session state.
10. As a user, I want to discover available models, so that I do not need to guess internal identifiers.
11. As a user, I want to choose a model by stable Model ID, so that automated runs are reproducible.
12. As a user, I want text and image attachments supplied as structured arguments, so that file input is not embedded unsafely in prompts.
13. As a user, I want file access scoped to the Project Root and explicitly authorized Additional Directories, so that tools cannot silently expand their filesystem boundary.
14. As a user, I want a default non-interactive Permission Mode, so that headless runs never stall waiting for terminal approval.
15. As an authorized user, I want a full-access Permission Mode, so that trusted local automation can execute the real JiaorongAI tool flow.
16. As a machine consumer, I want tool starts and results correlated by a stable Tool Call ID, so that every tool has one observable terminal outcome.
17. As a user, I want displayable reasoning summaries when JiaorongAI supplies them, so that progress is understandable without exposing raw chain of thought.
18. As a user, I want Ctrl-C to stop the real model/tool run, so that cancellation is not limited to hiding local output.
19. As an automation author, I want timeout and turn-limit controls, so that a run cannot continue indefinitely.
20. As an automation author, I want stable Machine Error Codes and exit codes, so that failure handling does not depend on error text.
21. As a user, I want authentication and model failures reported accurately, so that the CLI never claims an internal failure when the real cause is actionable.
22. As a user, I want the CLI to reject unsupported JiaorongAI versions, so that it does not corrupt sessions by guessing bridge compatibility.
23. As a security-conscious user, I want the debugging endpoint restricted to loopback and owned by JiaorongAI, so that the CLI never connects to an arbitrary process.
24. As a user with JiaorongAI already open without CDP, I want an explicit recovery instruction instead of a forced restart, so that active desktop work is preserved.
25. As a user, I want a doctor command, so that installation, version, application state, bridge capability, and model readiness can be diagnosed without starting a real agent turn.
26. As a developer, I want deterministic protocol and fake-bridge tests, so that most regressions are caught without live model credentials.
27. As a maintainer, I want real-application smoke tests, so that passing mocks cannot hide a broken bridge contract.
28. As a release owner, I want a clean reproducible build with a recorded revision and lock state, so that the tested artifact is identifiable.
29. As a release owner, I want the exact packaged candidate installed and tested locally, so that tests against source files cannot substitute for installation proof.
30. As a release owner, I want checksums and a Go/No-Go record, so that release evidence refers to one immutable candidate.
31. As a user, I want uninstall and rollback instructions, so that a failed local installation can be removed without affecting JiaorongAI data.

## Implementation Decisions

- The production CLI will keep the existing command and output protocol as its outer boundary and replace only the unavailable production backend with an application-backed backend.
- The application-backed backend will be the only module allowed to translate between the public CLI protocol and JiaorongAI bridge payloads. CLI parsing and renderers will not import CDP or JiaorongAI-specific code.
- Application lifecycle ownership remains with the user. The CLI may launch JiaorongAI only when it is absent; it will not terminate, replace, or restart an existing process.
- The default CDP endpoint will bind to loopback. Listener address, listener owner, executable path, CDP metadata, renderer target, application version, required bridge methods, routes, and events must all pass fail-closed validation.
- The first supported JiaorongAI version is exactly 0.5.6. Supporting another version requires new live compatibility evidence and an explicit allowlist change.
- The CDP transport will use Node's HTTP and WebSocket capabilities directly. It will not require OpenCLI, browser automation frameworks, or a copied adapter from another product.
- A unique bounded event buffer will be installed in the renderer for every CLI request. Buffers must be drained, overflow must fail explicitly, and listeners must be removed on every terminal path.
- Event correlation will require the current Session and real request identity. Concurrent runs must not consume, cancel, or terminate each other's events.
- JiaorongAI snapshot projection will be monotonic. Text and reasoning emit only validated deltas; each Tool Call ID emits at most one start and exactly one terminal result; one run emits exactly one Terminal Result.
- Attachment path, type, size, realpath, symlink, Project Root, and Additional Directory validation occurs before Session creation. Accepted files are then prepared through JiaorongAI's own file bridge.
- The default Permission Mode is non-interactive. Permission requests are denied through the real interaction-response bridge and surfaced as failed tool results. Full access must be selected explicitly.
- Ctrl-C and timeout use the same remote stop-and-settle state machine. A stop acknowledgement alone does not prove completion; the CLI waits for the original run to terminate before releasing its Session lock.
- stdout is reserved for the selected public output format. Diagnostics go to stderr and must redact secrets, prompts, database content, and unneeded absolute paths.
- The first Feature supports macOS and an installed JiaorongAI application. Independent OAuth, a self-contained agent runtime, Windows, Linux, TUI, server mode, plugins, subagents, and integrations with future downstream products are excluded.
- Current product documentation and ADRs that assume a future downstream product, independent desktop-free authentication, Windows support, or a self-contained first release conflict with this Feature. They must be superseded or updated before implementation is declared complete.
- Stable architecture contract:
  - CLI parsing and rendering own the public command and protocol.
  - App Runtime owns process, port, endpoint, and version safety.
  - CDP Client owns JSON-RPC transport only.
  - Deepchat Bridge owns bridge invocation, subscription, correlation, and cleanup.
  - Bridge Projector owns snapshot-to-v1 event state.
  - App Backend orchestrates those modules and exposes the existing backend seam.
  - JiaorongAI owns account state, providers, models, sessions, tools, skills, and SQLite persistence.
  - Data flows from CLI request to App Backend to bridge; events flow from bridge to projector to renderer. No module may write JiaorongAI's database directly.
  - Bridge schema drift, unowned endpoints, unknown snapshot shapes, buffer overflow, lost request identity, or unprovable remote cancellation are stop triggers, not best-effort conditions.
- Triggered delivery risks and controls:
  - Security and privacy: fail-closed loopback and process identity checks, bounded evaluation, no secret-bearing stdout, adversarial endpoint tests.
  - Performance and capacity: response-size, target-count, evaluation-time, buffer-size, and polling bounds with explicit overflow tests.
  - Reliability and recovery: single terminal state machine, finally-based cleanup, cancellation settlement, concurrent-run isolation, actionable recovery when the app is already running without CDP.
  - Compatibility: exact 0.5.6 allowlist and real bridge smoke tests; no inferred patch compatibility.
  - Observability and support: doctor output, redacted stderr diagnostics, recorded candidate identity, and an acceptance report tied to current evidence.
  - Data and rollback: no direct database migrations; installation and rollback affect only the CLI artifact and command exposure, never user sessions or JiaorongAI application data.

## Testing Decisions

- The primary functional seam is the real CLI executable as a child process connected to a fake loopback CDP/bridge server. Tests assert public arguments, stdin, stdout, stderr, events, exit codes, Session continuity, tools, cancellation, and failure behavior without reaching into backend internals.
- Existing fixture-backend and golden JSONL tests remain protocol-level regression tests.
- Focused unit tests cover only deterministic boundaries that are difficult to prove through the process seam: endpoint validation, process ownership parsing, CDP request lifecycle, snapshot projection, bounded buffers, path boundaries, and error normalization.
- Integration tests use the production entry point and fake CDP server rather than swapping in the fixture backend, proving that production wiring reaches the app-backed backend.
- Negative and boundary tests cover non-loopback endpoints, unrelated listeners, unsupported versions, missing routes/events, oversized responses, target limits, evaluation timeouts, malformed snapshots, unknown tools, buffer overflow, attachment traversal/symlinks, duplicate terminals, cross-request events, and failed cancellation settlement.
- Functional tests preserve Unicode, newlines, quotes, and shell metacharacters end to end and prove that prompts are never assembled into shell command strings.
- Real JiaorongAI smoke tests cover doctor, model discovery, one real text run, Session resume, all three output modes, one attachment, one observable Read tool effect, and real Ctrl-C cancellation. Natural-language output is not asserted byte-for-byte.
- Feature completion requires the full relevant deterministic suite plus live smoke evidence. Any live scenario not run or not provable remains incomplete or explicitly waived by the user; it cannot be inferred from mocks.
- Release verification uses a clean checkout or equivalent isolated build, records Node/npm/platform/lock state and source revision, packages one candidate, records filename and checksum, installs that exact candidate, and tests the installed command rather than a repository-relative script.
- Local installation smoke covers version, doctor, one critical real run, Session persistence, and uninstall/rollback behavior. A rebuilt artifact is a different candidate and invalidates affected evidence.
- Substantive ticket diffs are reviewed against a fixed comparison point, blocking findings are resolved, and affected checks are rerun before ticket completion.

## Out of Scope

- Modifying the JiaorongAI source repository.
- Reimplementing JiaorongAI providers, agent runtime, tools, skills, authentication, or persistence in the CLI repository.
- Running without an installed JiaorongAI application.
- Supporting JiaorongAI versions other than 0.5.6 without new evidence.
- Windows or Linux support in this Feature.
- Independent OAuth, credential storage, or headless authentication.
- Direct database access or database schema migration.
- TUI, daemon, background server, ACP, plugin management, subagent management, or custom-agent administration.
- Integration with C4Workdian, Workbuddian, or any other downstream product.
- Production deployment or remote rollout. This Release is limited to a reproducible local artifact, local installation, local smoke, and rollback/uninstall proof.

## Further Notes

- The application source reference inspected for this design is JiaorongAI 0.5.6. The installed application must still be verified at test time; source inspection is not runtime compatibility proof.
- The current repository's unavailable backend is intentional baseline behavior, not evidence of a working product path.
- The current protocol conformance inventory is incomplete. Feature and Release reports must distinguish implemented cases, missing cases, live evidence, and waived cases rather than reporting a blanket pass.
- Release status may only be reported as verified after the exact installed candidate passes its required local smoke tests and rollback/uninstall proof. Otherwise the status is No-Go or released-unverified, with the missing evidence stated.
