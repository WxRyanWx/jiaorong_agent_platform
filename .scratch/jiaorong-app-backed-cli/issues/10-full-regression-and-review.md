# 10 — Pass full regression and resolve review findings

**What to build:** Prove the complete Feature stays correct across public CLI behavior, security boundaries, process lifecycle, protocol compatibility, and documentation, then resolve every blocking review finding.

**Blocked by:** 09 — Complete the active deterministic conformance suite.

**Status:** ready-for-agent

- [ ] Static checks, full tests, deterministic conformance, functional process tests, negative boundaries, and targeted regressions pass from the current source revision.
- [ ] Product documentation, command help, ADRs, protocol docs, and installation instructions match actual behavior.
- [ ] A substantive review compares against the approved Feature baseline and fixed pre-Feature commit.
- [ ] All blocking findings are fixed and affected checks are rerun.
- [ ] Skipped live checks or known defects are explicit and block Release unless waived.

## Architecture contract

Review reopens architecture when implementation crosses an unapproved layer, duplicates JiaorongAI state, weakens fail-closed behavior, or cannot be tested at the public process seam.

## Expected proof

Full command log, diff review findings and resolutions, current documentation checks, and verification-before-completion evidence.
