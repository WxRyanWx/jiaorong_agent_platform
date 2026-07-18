# Base stream events on the Gemini CLI taxonomy

Jiaorong CLI `stream-json` output will use the Gemini CLI event taxonomy as its baseline: `init`, `message`, `tool_use`, `tool_result`, `error`, and `result`, with the deliberate addition of optional `reasoning_summary`. Workbuddian's Jiaorong adapter will project these events into its internal transport events; once the machine protocol is established, a Headless Run must begin with exactly one `init` event and end with exactly one Terminal Result.
