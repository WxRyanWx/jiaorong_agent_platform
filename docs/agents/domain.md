# Domain Docs

This repository uses a single-context domain documentation layout.

## Before exploring

- Read `CONTEXT.md` at the repository root.
- Read the ADRs under `docs/adr/` that affect the area being changed.
- If a referenced domain file does not exist, proceed silently instead of creating speculative documentation.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulary

Use the domain terms defined in `CONTEXT.md` in specs, tickets, tests, code, and reviews. Do not replace a defined term with a synonym that the glossary explicitly rejects.

If a required concept is missing, first determine whether the proposed term is unnecessary. Record a genuine vocabulary gap for domain-modeling work instead of silently inventing a new contract.

## ADR conflicts

When a proposed change contradicts an existing ADR, identify the conflict explicitly. Do not silently override the earlier decision. Reopen, replace, or supersede the ADR as part of the approved change.
