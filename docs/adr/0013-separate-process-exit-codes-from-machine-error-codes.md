# Separate process exit codes from Machine Error Codes

Jiaorong CLI will use the Gemini CLI process-exit categories `0`, `1`, `42`, and `53`, plus the Unix-standard `130` for SIGINT cancellation. Machine-readable errors and the Terminal Result will additionally carry a stable Machine Error Code from the v1 set: `AUTH_REQUIRED`, `INVALID_ARGUMENT`, `UNSUPPORTED_PROTOCOL`, `MODEL_UNAVAILABLE`, `PERMISSION_DENIED`, `TOOL_FAILED`, `UNSUPPORTED_ATTACHMENT`, `TIMEOUT`, `TURN_LIMIT`, `CANCELLED`, or `INTERNAL_ERROR`; consumers must never infer behavior by parsing display text.
