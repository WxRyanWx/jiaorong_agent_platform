# Authenticate the CLI independently of the desktop client

Jiaorong CLI will authenticate against the Jiaorong account system through an explicit browser OAuth or device-authorization login and store credentials in the operating system's secure credential store, following Codex CLI, Claude Code, and Gemini CLI. It will provide login, authentication-status, and logout commands; Headless Runs will never open an implicit login flow, and CI may use an environment-provided token as an optional non-default mechanism. The CLI will not depend on credentials owned by a running desktop client.
