# Support text, JSON, and streaming JSON output

Jiaorong CLI Headless Runs will support `text`, `json`, and `stream-json` output modes, following the established Gemini CLI, Claude Code, and CodeBuddy CLI pattern. Workbuddian will consume newline-delimited `stream-json`; stdout will contain only contract output, diagnostics will use stderr, each JSONL line will be a complete object, every run that establishes the machine protocol will emit exactly one terminal event, and the process exit code must agree with that event.
