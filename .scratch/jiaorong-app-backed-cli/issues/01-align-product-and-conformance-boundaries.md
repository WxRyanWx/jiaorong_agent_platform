# 01 — Align product and conformance boundaries

**What to build:** Establish Jiaorong CLI as a direct JiaorongAI user and automation product, supersede contradictory desktop-free and downstream-integration decisions, and split deterministic, live, and deferred conformance scopes so every later ticket has an honest acceptance boundary.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Resolution:** completed

- [x] The domain glossary and active product documentation contain no current C4Workdian, Workbuddian, CodeBuddy replacement, or downstream-adapter requirement.
- [x] A durable ADR records the macOS JiaorongAI 0.5.6 App Backend decision and explicitly supersedes conflicting ADRs.
- [x] Deterministic protocol cases, live JiaorongAI cases, and deferred downstream-product cases are represented as separate inventories.
- [x] The deterministic conformance runner reports coverage only against its active deterministic inventory; it does not count live or deferred cases as missing.
- [x] Existing unit tests pass and new tests lock the inventory split and product-boundary cleanup.
- [x] Evidence records the exact remaining deterministic conformance gap without claiming completion.

## Architecture contract

The public v1 protocol remains owned by Jiaorong CLI. Product documents may not make a non-existent downstream application the owner of CLI behavior. App Backend compatibility is explicit and version-gated.

## Expected proof

Targeted domain/inventory tests, the full current unit suite, conformance summary inspection, and a repository search for removed downstream assumptions.

## Comments

### 2026-07-19 — completion evidence

- `npm test`: exit 0; 18 tests, 18 passed, 0 failed.
- `npm run conformance:fixture`: expected exit 1 because active coverage is incomplete; `scope=deterministic`, `executedOk=true`, `failed=0`, `required=101`, `executed=19`, `missing=82`.
- Exact remaining deterministic IDs: `ATT-001`, `ATT-002`, `ATT-003`, `ATT-004`, `ATT-005`, `ATT-006`, `ATT-007`, `ATT-008`, `AUT-001`, `AUT-003`, `CAN-001`, `CAN-002`, `CAN-003`, `CAN-004`, `CAN-005`, `CAN-006`, `CLI-002`, `CMP-001`, `CMP-002`, `CMP-003`, `CMP-004`, `CMP-005`, `CMP-006`, `ERR-001`, `ERR-002`, `ERR-003`, `ERR-004`, `ERR-005`, `ERR-006`, `EVT-001`, `EVT-002`, `EVT-003`, `EVT-004`, `EVT-005`, `EVT-006`, `EVT-007`, `EVT-008`, `EVT-009`, `EVT-010`, `EVT-011`, `EVT-012`, `EVT-013`, `EVT-014`, `EVT-015`, `EVT-016`, `EVT-017`, `FIL-001`, `FIL-002`, `FIL-003`, `FIL-004`, `FIL-005`, `FIL-008`, `MOD-001`, `MOD-002`, `MOD-004`, `MOD-005`, `OUT-006`, `OUT-007`, `OUT-008`, `OUT-009`, `PER-001`, `PER-002`, `PER-003`, `PER-004`, `PER-005`, `PER-006`, `PER-007`, `SES-001`, `SES-002`, `SES-003`, `SES-005`, `SES-006`, `SES-010`, `TIM-002`, `TOL-001`, `TOL-002`, `TOL-003`, `TOL-004`, `TOL-005`, `TOL-006`, `TOL-007`, `TUR-002`.
- `rg` over `CONTEXT.md`, `README.md`, the active PRD, protocol, and conformance matrix found no current downstream-product terms.
- This ticket does not claim full conformance; Tickets 02–09 own the 82 active missing cases.
