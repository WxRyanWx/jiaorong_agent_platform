# Use the macOS JiaorongAI 0.5.6 App Backend for v1

Status: Accepted
Date: 2026-07-19

## Context

The existing CLI protocol and fixture backend are useful, but the production entry point has no real Agent Runtime. JiaorongAI already owns providers, account state, models, sessions, tools, skills, interaction handling, and persistence. Reimplementing those capabilities in this repository would create a second product with incompatible state and unproved behavior. Modifying the private `jiaorong_agent_platform` repository is outside the approved scope.

Source inspection and the installed application establish a version-specific bridge route for JiaorongAI 0.5.6. It is accessible through Electron CDP when the application is launched with a loopback debugging endpoint. This is an internal compatibility boundary, not a universal protocol.

## Decision

Jiaorong CLI v1 will be a macOS command-line client backed by an installed JiaorongAI 0.5.6 application.

- The CLI owns public arguments, output formats, protocol validation, diagnostics, and process exit behavior.
- JiaorongAI owns authentication state, providers, models, Agent Sessions, tools, skills, interaction handling, and SQLite persistence.
- App Runtime owns safe application discovery, process/listener identity, supported-version checks, renderer selection, and launch-only-when-absent behavior.
- CDP Client owns bounded JSON-RPC transport only.
- Deepchat Bridge owns allowlisted bridge invocation, event subscription, request correlation, and cleanup.
- Bridge Projector owns monotonic snapshot-to-v1 event projection.
- App Backend orchestrates those modules behind the existing backend seam.
- No CLI module may read or write JiaorongAI's database directly.
- A running application without a verified endpoint is never terminated or restarted automatically.
- Endpoint, owner, executable, metadata, renderer, version, route, event, payload, timeout, buffer, and cancellation checks fail closed.
- The supported application allowlist contains only version 0.5.6 until new live compatibility evidence is approved.

The public v1 protocol remains stable so a future native headless runtime can replace App Backend without changing callers.

## Conformance scopes

Conformance is partitioned into three disjoint inventories:

1. `deterministic-case-ids.json` is the only inventory used by the public deterministic runner.
2. `live-case-ids.json` requires the supported installed application, a usable model, or the exact packaged candidate.
3. `deferred-case-ids.json` preserves historical or out-of-scope IDs for traceability. Deferred IDs are neither passed nor missing active cases.

## Superseded decisions

This ADR fully supersedes the incompatible first-release direction in:

- ADR 0001 (a future downstream replacement as the primary product goal),
- ADR 0002 (a desktop-independent first release),
- ADR 0003 (CLI-owned Session persistence),
- ADR 0009 (independent CLI authentication),
- ADR 0015 (Windows support in the first release), and
- ADR 0016 (signed self-contained executables as the first local candidate).

It partially supersedes downstream-product-specific wording in ADRs 0004, 0005, 0007, 0008, 0010, 0012, and 0014 while retaining their still-applicable public protocol behavior. It narrows ADR 0017 by removing login, logout, update, and independent-runtime commands from the first App Backend release. ADRs 0006, 0011, and 0013 remain active.

If an older ADR conflicts with this decision, this ADR governs Jiaorong CLI v1.

## Consequences

- Users must install and run JiaorongAI.app.
- The first release is version- and platform-specific.
- Live smoke is required because deterministic fixtures cannot prove the private bridge contract.
- CLI install and uninstall do not migrate or delete JiaorongAI data.
- A future native runtime remains possible behind the backend seam, but is not implemented speculatively.
