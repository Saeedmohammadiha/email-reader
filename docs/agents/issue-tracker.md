# Issue tracker: Local Markdown

Issues and specs live under `.scratch/`.

- Use one directory per feature: `.scratch/<feature-slug>/`.
- Put the spec at `.scratch/<feature-slug>/spec.md`.
- Put each implementation ticket in its own file at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state in a `Status:` line near the top of each ticket.
  See `triage-labels.md` for the status values.
- Append comments and conversation history under `## Comments`.

When a skill says to publish to the issue tracker, create the appropriate
file under the feature directory. When it asks for a ticket, read the
referenced file.

## Wayfinding operations

- Store the map at `.scratch/<effort>/map.md`.
- Store each decision ticket at `.scratch/<effort>/issues/NN-<slug>.md`.
- Record its type as `Type: research`, `prototype`, `grilling`, or `task`,
  and its state as `Status: claimed` or `resolved`.
- Record dependencies as `Blocked by: NN, NN`. A ticket is unblocked when
  all listed tickets are resolved.
- Select the first numbered open, unblocked, unclaimed ticket. Claim it by
  setting `Status: claimed` and saving it.
- Resolve it by adding `## Answer`, setting `Status: resolved`, and adding
  a summary and link to the map's decisions.
