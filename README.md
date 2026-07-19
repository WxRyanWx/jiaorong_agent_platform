# Jiaorong CLI

This directory is the product-owned Jiaorong CLI workspace. The production CLI uses an installed, running JiaorongAI application as its real backend through a validated loopback bridge; it does not modify JiaorongAI or read its database directly.

## Current implementation boundary

- Versioned v1 JSON Schemas and all 18 frozen golden JSONL fixtures are implemented.
- The protocol validator enforces Schema, event ordering, content, tool correlation, and terminal status/error/exit invariants.
- The black-box runner reports only the active deterministic inventory. Live JiaorongAI cases and deferred historical cases have separate inventories and never inflate deterministic missing coverage.
- The foreground CLI core supports argument/stdin input, `text`, `json`, and `stream-json` projection, stdout/stderr separation, and a backend adapter seam.
- The test distribution uses a deterministic fixture backend through the full CLI path.
- The production entry point does not enable the fixture backend. App Backend implementation and live release evidence are tracked separately from deterministic protocol coverage.

## Development

```bash
npm install
npm test
node ./bin/jiaorong-cli-conformance.mjs \
  --binary ./tests/fixtures/conformant-cli.mjs \
  --protocol 1
```

The conformance command currently exits `1` because the active Deterministic Conformance Inventory is incomplete. Inspect `coverage` and `missingCaseIds` in its JSON summary; live and deferred inventories are reported separately.
