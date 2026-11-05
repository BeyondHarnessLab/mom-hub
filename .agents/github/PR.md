<!--
Agent-only PR body. Humans use `.github/PULL_REQUEST_TEMPLATE.md`.

Keep every heading. If a section does not apply, write why; do not delete it.
Match the user's language in the filled answers. Do not invent facts.

Keep the body short and factual. Do not paste unfiltered AI-generated text
in the PR body or in later comments. Verification must be commands actually
run and what was observed. Stating only that `go build` or tests passed is
not proof.
-->

## Agent

- Tool:
- Tool version:
- Model (full id):
- Host (CLI / IDE / GitHub coding agent / other):
- Date (UTC):

## Links

- Related:

## Kind

- [ ] Bug fix
- [ ] New feature
- [ ] Performance / refactor
- [ ] Docs
- [ ] Other:

## Background

If a needed item is unknown, ask the user. Do not invent it.

- Actual behavior:
- Impact:
- Frequency:
- Evidence (code paths, logs, requests):
- Areas touched (relay / billing / frontend / deployment; write "not applicable" otherwise):

## Change

(what changed, why it works, grounded in the code actually touched.
Short and factual; do not paste unfiltered AI-generated text.)

## Research

### Prior art

- Search queries (PRs):
- What already existed and why this is not a duplicate:

### Code and docs

- Code paths and what they imply for this change:
- Repo docs consulted:

### Alternatives considered

- Option A:
- Option B:
- Why this approach:

## Files

| Path | Why |
| --- | --- |
|  |  |

## Behavior

- Before:
- After:
- Explicit non-goals / leftover work:

## Verification

Only what was actually run. Do not state only that `go build` or tests passed.
Each item needs the command or steps and the observed result.

- Commands and results:
- Manual steps and observed result:
- UI: screenshot or recording (or why none):
- Tests added or updated, or why none:
- Databases / providers / platforms exercised:
- Not verified:

## Risks

- Failure modes:
- Billing / quota / auth impact:
- Follow-ups:

## Scope check

- Single focused change: yes/no (if no, why):
- Secrets included: no
