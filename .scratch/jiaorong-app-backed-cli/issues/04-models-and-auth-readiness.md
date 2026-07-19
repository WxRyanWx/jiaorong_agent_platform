# 04 — Discover models and report authentication readiness

**What to build:** Let users inspect real JiaorongAI model availability, select a stable Model ID for a run, and receive actionable authentication or model errors without independent CLI OAuth.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** resolved

- [x] `models list` returns Schema-valid text and JSON model catalogs from enabled JiaorongAI providers.
- [x] The selected Model ID maps to an exact provider/model pair before the run starts.
- [x] Unknown, disabled, unavailable, and unauthenticated selections produce stable Machine Error Codes and do not create garbage Sessions.
- [x] Doctor reports authentication/model readiness without printing credentials.
- [x] Relevant auth/model deterministic conformance cases pass through public process I/O.

## Architecture contract

JiaorongAI remains the owner of credentials and provider configuration. The CLI reads bridge projections and never reads credential storage directly.

## Expected proof

Fake catalog/auth process tests, error mapping tests, Schema validation, and real model discovery smoke.

## Comments

### 2026-07-19 — Standards re-review against `32be9b3c1ce3904d05246103901214f0afac3746`

- **Hard blocker:** `src/backends/jiaorong-app-backend.mjs:61-75` parses the free-form JiaorongAI `errorMsg` with regular expressions to infer `AUTH_REQUIRED` and `MODEL_UNAVAILABLE`. That classification depends on localized/changing display text, so it cannot prove the stable Machine Error Code required by `CONTEXT.md:59-61`, ADR 0013, and acceptance criterion 3. Use a verified structured bridge discriminator; until one exists, map an unstructured failed connection check to `INTERNAL_ERROR`. Keeping text parsing would require an explicitly approved, version-pinned compatibility contract and live evidence.
- No other Standards blocker remains in the reviewed scope: catalog payloads fail closed, public Model IDs uniquely encode the exact provider/model pair, Session fallback is rejected, doctor is read-only, clients are closed, and provider error text/credentials are not emitted.
- Non-blocking judgement calls: the repeated provider/model fields are a possible Data Clump; the duplicated bridge-route allowlists are possible Shotgun Surgery. Both are currently small, explicit compatibility/test mirrors and do not justify abstraction in this ticket.
- Current proof: `node --test tests/app-models.test.mjs tests/conformance-runner.test.mjs` passed 20/20. `npm run conformance:fixture` reported `executedOk=true`, 35 executed cases and 0 failed; it remains `complete=false` with 66 later-ticket cases missing. `git diff --check 32be9b3c1ce3904d05246103901214f0afac3746` passed.

### 2026-07-19 — Resolution and current evidence

- Resolved the blocker by deleting all `errorMsg` classification. The verified 0.5.6 route exposes only `{ isOk, errorMsg }`, so every unstructured failed connection check now returns a redacted `INTERNAL_ERROR`; tests lock authentication-shaped and model-shaped messages to that behavior. Catalog-proven unknown, disabled, and unavailable selections still return `MODEL_UNAVAILABLE` before Session creation.
- Full repository tests: `npm test` passed 80/80.
- Deterministic conformance: `required=101`, `executed=35`, `missing=66`, `failed=0`, `executedOk=true`, `complete=false`. Ticket 04 cases `AUT-001`, `AUT-002`, `AUT-003`, `MOD-001`, `MOD-002`, `MOD-003`, `MOD-004`, and `MOD-005` pass; the 66 missing cases remain assigned to later tickets.
- Static/dependency checks: every tracked `.mjs` passed `node --check`; `npm audit --json` reported zero vulnerabilities; `git diff --check` passed.
- Real JiaorongAI 0.5.6 smoke: `models list` returned 38 Schema-valid entries with the sole available/default ID `jiaorong/jiaorong-deepseek-v4-pro`; read-only doctor returned `ok=true` and `authentication=warn`; a qualified-ID run exited 0 with Session `6-V4CA8FOedEEZIPWCScN`, one `result`, and exact content `TICKET04_OK`.
