# 12 — Audit acceptance and deliver the complete report

**What to build:** Produce an evidence-backed acceptance matrix and a complete plain-language report that tells the user exactly what was built, how it works, what passed, what failed, what was not verified, how to install/use/uninstall it, and whether the Release candidate is a Go or No-Go.

**Blocked by:** 11 — Build, install, and smoke one immutable Release candidate.

**Status:** ready-for-agent

- [ ] Every Feature requirement maps to a scenario, authoritative current evidence, and achieved/not-achieved/waived status.
- [ ] Every ticket has completion evidence and no unresolved blocking finding.
- [ ] Test totals, commands, versions, revisions, artifact names, checksums, installed paths, dates, and live outcomes are copied from current evidence, not memory.
- [ ] The report clearly distinguishes deterministic tests, functional tests, live JiaorongAI smoke, Release candidate checks, and local installation proof.
- [ ] Installation, usage, diagnostics, rollback, and uninstall instructions are understandable without reading source code.
- [ ] Residual risks, limitations, skipped checks, and unverified claims are explicit.

## Architecture contract

The report is evidence, not marketing. Missing proof cannot be upgraded to a pass, and a No-Go result must be reported directly.

## Expected proof

Acceptance matrix, final report artifact, cross-check against command outputs and Release metadata, and explicit user handoff.
