# Jiaorong CLI

This directory is the separate product-owned Jiaorong CLI workspace. It does not migrate Workbuddian and does not use Jiaorong desktop automation.

## Current implementation boundary

- Versioned v1 JSON Schemas and all 18 frozen golden JSONL fixtures are implemented.
- The protocol validator enforces Schema, event ordering, content, tool correlation, and terminal status/error/exit invariants.
- The black-box runner owns the complete 142-case inventory from the frozen conformance matrix. It executes a growing subset plus the static asset gate and reports exact coverage and missing IDs at runtime, so it deliberately exits non-zero instead of claiming full conformance.
- The foreground CLI core supports argument/stdin input, `text`, `json`, and `stream-json` projection, stdout/stderr separation, and a backend adapter seam.
- The test distribution uses a deterministic fixture backend through the full CLI path.
- The production entry point does not enable that fixture backend. Until the real Jiaorong backend and authentication contracts are supplied, a Headless Run fails explicitly with `INTERNAL_ERROR`.

## Development

```bash
npm install
npm test
node ./bin/jiaorong-cli-conformance.mjs \
  --binary ./tests/fixtures/conformant-cli.mjs \
  --protocol 1
```

The conformance command currently exits `1` because its full case inventory is intentionally incomplete. Inspect `coverage` and `missingCaseIds` in its JSON summary.
