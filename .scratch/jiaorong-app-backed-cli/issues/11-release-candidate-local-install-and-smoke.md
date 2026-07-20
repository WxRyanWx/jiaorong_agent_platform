# 11 — Build, install, and smoke one immutable Release candidate

**What to build:** Create one reproducible Jiaorong CLI Release candidate from reviewed source, install that exact artifact locally, verify it against the real JiaorongAI application, and prove safe uninstall or rollback.

**Blocked by:** 10 — Pass full regression and resolve review findings.

**Status:** ready-for-agent

**Resolution:** completed — candidate decision Go with LIVE-009 waiver

- [x] A clean checkout or equivalent isolated environment records source revision, Node/npm/platform, lock state, build command, artifact filename, and checksum.
- [x] One candidate is packaged and no source, dependency, configuration, or build input changes after candidate creation.
- [x] The exact candidate is installed locally and the command resolves from the installed path, not the repository.
- [x] Installed version, doctor, model discovery, one real run, Session resume, output modes, attachment, Read tool effect, and Ctrl-C cancellation pass against JiaorongAI 0.5.6.
- [x] Uninstall or rollback removes/replaces only the CLI artifact and preserves JiaorongAI application data and Sessions.
- [x] A Go/No-Go record names unresolved defects, evidence gaps, and candidate identity.

## Architecture contract

The tested artifact is immutable. Rebuilding or changing inputs creates a new candidate and invalidates affected installation evidence.

## Expected proof

Clean build log, checksum, installed-command path and version, real smoke artifacts, Session evidence, uninstall/rollback proof, and Go/No-Go decision.

## Comments

### 2026-07-20 — completion evidence

- RC1: `jiaorong-cli-0.1.0.tgz`, 63,000 bytes, SHA-256 `949a36bc1bdf1b9bdb77e61e4500ab85493e201c63f88b3724bb8c50c6a69e32`, 77 entries. Package input tree SHA-256 `a0d5b561fded1c320aff4d9bc04a5d84128cfa527b8422151139c520a02c853b`.
- The 77 frozen package inputs were copied into a new isolated `/tmp` tree and packed independently; the rebuilt tgz had the identical SHA-256 `949a36bc1bdf1b9bdb77e61e4500ab85493e201c63f88b3724bb8c50c6a69e32`.
- Installed exact artifact under `/Users/miemie/.npm-global`; installed package content matched the tgz. Real 0.5.6 version/doctor/models/text/json/stream/resume/text Attachment/Additional Directory Read/Ctrl-C passed.
- Strong resume proof: Session `ATqSrcxCKooLglZX3uTht` second process returned previous-turn-only canary `JRC_RC1_SESSION_MEMORY_64BC2A`.
- Read proof: Session `gYfDf2JKq5p2lBccUT6lo` emitted correlated `read` tool_use/tool_result and returned the Additional Directory canary.
- Ctrl-C proof: Session `Xxy6GfB04Q5jMw5KI_3XQ`, 2,471 ms, exit 130, stderr empty, `cancelled/CANCELLED`.
- Final uninstall removed both commands, left JiaorongAI PID 6562/listener unchanged, and Session `ATqSrcxCKooLglZX3uTht` restored idle with four messages. Temporary canaries were removed.
- Initial pre-waiver decision: No-Go because LIVE-009 could not run without an available image-capable model and no owner waiver then existed. The later owner decision below supersedes this decision. Full dossier: `docs/jiaorong-cli-v1-release-dossier.md`.

### 2026-07-20 — LIVE-009 continuation evidence

- Reinstalled the exact RC1 artifact without rebuilding it. A five-band PNG canary had SHA-256 `9686d768a632ce24e19384b7376fe690d57e2c21d666f4991c4a7417e43a8680`.
- Session `01uhEev_fE2IXhdCZULPN` registered the PNG Attachment but the text-only model attempted `read`; the tool did not reach a verified terminal state and the run failed with `INTERNAL_ERROR`.
- Session `hy12p-9jZD1QKYbnJnTKn` was instructed to use only direct visual input. It completed the protocol turn but explicitly reported that it could not visually perceive the Attachment and did not identify the canary.
- At this point, before the later owner decision, LIVE-009 remained blocked. These results replaced “not attempted” with current negative live evidence and did not themselves authorize a waiver or Go decision.

### 2026-07-20 — owner waiver and final decision

- Workspace owner decision: “不用本机 ollama，第一版先不管图片 Attachment。”
- This explicitly waives LIVE-009 as a first-release gate while preserving its negative evidence and risk. It does not mark image recognition as passed.
- Final candidate decision: Go. The exact RC1 remains unchanged and is release-verified for the approved first-release scope.
- Post-waiver installed target observation passed: doctor `ok=true`; Session `3IyIIa00rfHLg7ZWqNtBz` returned exact canary `JRC_V1_RELEASE_GO_27C9` with `status=success` and exit 0.
