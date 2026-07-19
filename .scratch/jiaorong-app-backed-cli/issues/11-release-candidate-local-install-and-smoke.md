# 11 — Build, install, and smoke one immutable Release candidate

**What to build:** Create one reproducible Jiaorong CLI Release candidate from reviewed source, install that exact artifact locally, verify it against the real JiaorongAI application, and prove safe uninstall or rollback.

**Blocked by:** 10 — Pass full regression and resolve review findings.

**Status:** ready-for-agent

- [ ] A clean checkout or equivalent isolated environment records source revision, Node/npm/platform, lock state, build command, artifact filename, and checksum.
- [ ] One candidate is packaged and no source, dependency, configuration, or build input changes after candidate creation.
- [ ] The exact candidate is installed locally and the command resolves from the installed path, not the repository.
- [ ] Installed version, doctor, model discovery, one real run, Session resume, output modes, attachment, Read tool effect, and Ctrl-C cancellation pass against JiaorongAI 0.5.6.
- [ ] Uninstall or rollback removes/replaces only the CLI artifact and preserves JiaorongAI application data and Sessions.
- [ ] A Go/No-Go record names unresolved defects, evidence gaps, and candidate identity.

## Architecture contract

The tested artifact is immutable. Rebuilding or changing inputs creates a new candidate and invalidates affected installation evidence.

## Expected proof

Clean build log, checksum, installed-command path and version, real smoke artifacts, Session evidence, uninstall/rollback proof, and Go/No-Go decision.
