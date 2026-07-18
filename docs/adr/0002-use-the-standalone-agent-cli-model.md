# Use the standalone Agent CLI model

Jiaorong CLI will follow the mature standalone Agent CLI model used by Codex CLI, Claude Code, Gemini CLI, and CodeBuddy CLI: an independently executable foreground process owns the agent run, model communication, tools, permissions, session continuity, and machine-readable output. Its first release will not depend on a desktop client, CDP, GUI automation, or a daemon; background and server modes may be considered later as optional capabilities.
