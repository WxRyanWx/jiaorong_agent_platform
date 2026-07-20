# Cancel foreground runs with SIGINT

Status: Accepted (as narrowed by ADR 0018 and the pinned JiaorongAI 0.5.6 settlement below)
Date: 2026-07-20

A terminal user or foreground-process caller requests cancellation of a Jiaorong CLI Headless Run by sending `SIGINT`, following the foreground-process behavior of Codex CLI, Claude Code, and Gemini CLI. Jiaorong CLI must propagate cancellation to the active model request and tools, emit a Terminal Result with `status: "cancelled"`, and exit with code 130; if it does not exit within the contractually defined grace period, the caller may force-terminate the process. A separate stop subcommand is not part of the first release.

For the App Backend selected by ADR 0018, the first SIGINT invokes the pinned `chat.stopStream` route after `chat.sendMessage` has started. The CLI prefers the correlated stream terminal. JiaorongAI 0.5.6 has an AbortError branch that persists an assistant error and returns the Session to idle without publishing a stream terminal; the CLI may accept only that exact structured state through `sessions.restore`. A stop acknowledgement alone never proves cancellation. After observing SIGINT or timeout, the CLI narrows its internal settlement deadline to at most 30 seconds; an unproven settlement fails closed and retains the renderer Session lock. The caller grace period is 30 seconds; a second SIGINT force-exits immediately without claiming remote settlement.
