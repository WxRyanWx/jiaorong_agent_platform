# 04 — Discover models and report authentication readiness

**What to build:** Let users inspect real JiaorongAI model availability, select a stable Model ID for a run, and receive actionable authentication or model errors without independent CLI OAuth.

**Blocked by:** 03 — Run a real single turn in every output mode.

**Status:** ready-for-agent

- [ ] `models list` returns Schema-valid text and JSON model catalogs from enabled JiaorongAI providers.
- [ ] The selected Model ID maps to an exact provider/model pair before the run starts.
- [ ] Unknown, disabled, unavailable, and unauthenticated selections produce stable Machine Error Codes and do not create garbage Sessions.
- [ ] Doctor reports authentication/model readiness without printing credentials.
- [ ] Relevant auth/model deterministic conformance cases pass through public process I/O.

## Architecture contract

JiaorongAI remains the owner of credentials and provider configuration. The CLI reads bridge projections and never reads credential storage directly.

## Expected proof

Fake catalog/auth process tests, error mapping tests, Schema validation, and real model discovery smoke.
