# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The feature spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`. Never combine all tickets into one file.
- Triage state is recorded as a `Status:` line near the top of each issue file. See `triage-labels.md` for the valid role strings.
- Comments and conversation history are appended under a `## Comments` heading at the bottom of the file.

## Publishing to the issue tracker

When a skill says to publish a spec or issue, create the corresponding file under `.scratch/<feature-slug>/`, creating the directory if needed.

## Fetching a ticket

When a skill says to fetch a ticket, read the referenced file under `.scratch/`. The user normally provides the path or ticket number.

## Wayfinding operations

For a large effort managed by `wayfinder`:

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- `Type:` records `research`, `prototype`, `grilling`, or `task`.
- `Status:` records `claimed` or `resolved`.
- `Blocked by: NN, NN` lists prerequisite tickets.
- The frontier is the first open, unblocked, unclaimed ticket by number.
- Claim by setting `Status: claimed` before work.
- Resolve by appending the result under `## Answer`, setting `Status: resolved`, and adding a concise decision pointer to the map.
