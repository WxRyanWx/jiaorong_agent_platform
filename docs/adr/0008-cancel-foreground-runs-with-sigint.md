# Cancel foreground runs with SIGINT

Workbuddian will request cancellation of a Jiaorong CLI Headless Run by sending `SIGINT`, following the foreground-process behavior of Codex CLI, Claude Code, and Gemini CLI. Jiaorong CLI must propagate cancellation to the active model request and tools, emit a Terminal Result with `status: "cancelled"`, and exit with code 130; if it does not exit within the contractually defined grace period, the caller may force-terminate the process. A separate stop subcommand is not part of the first release.
