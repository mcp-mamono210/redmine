
# AGENTS.md

This repository is designed to be worked on by humans and coding agents.

## Required reading order

Before changing MCP behavior, read:

1. `README.md`
2. `docs/contracts/read-only-mcp-contract.md`
3. `docs/adr/README.md`
4. the ADRs relevant to the change
5. the corresponding implementation and regression tests

## Source-of-truth rules

Use each document for a different purpose:

```text
README.md
  -> overview only

docs/contracts/read-only-mcp-contract.md
  -> exact public MCP names, limits, inputs, outputs, and error contract

docs/adr/
  -> why architectural decisions were made

source + tests
  -> executable implementation of the contract
```

Do not copy exact tool lists, pagination limits, include values, or response
field lists into new overview or ADR documents.

If contract documentation and implementation disagree, treat the disagreement
as a defect. Do not silently choose one side.

## Version semantics

`package.json` contains the latest released package version until the release
ticket changes it.

A contract document may describe an unreleased target version. In that case it
must explicitly say `Draft` and name the target release.

Do not bump package version as part of an unrelated implementation ticket.

## Architectural constraints

Do not introduce any of the following without an explicit contract/ADR change:

- generic Redmine CRUD or arbitrary REST tools
- delete tools
- HTTP/SSE transport
- `outputSchema`
- `structuredContent`
- write capability on the read-only Redmine role
- unbounded list/search responses

Context efficiency is a functional requirement, not only an optimization.

## ADR changes

Do not silently rewrite an Accepted ADR when a decision materially changes.

For a materially different decision:

1. create a new ADR
2. mark the old ADR `Superseded by ADR-NNN`
3. update `docs/adr/README.md`
4. update the contract document if public behavior changes

Minor clarifications that do not change the decision may update an existing ADR.

## Public contract changes

A change to any of the following is a contract change:

- tool name
- tool description
- input schema
- output shape
- application error shape
- documented bounds
- documented include semantics

Update the contract document and relevant regression tests in the same change.

## Validation

Before completing a behavior change, run the applicable checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

Do not weaken or remove a regression assertion only to make a change pass.

## Git and agent execution safety

Before making changes:

- run `git status`
- preserve unrelated user changes
- do not reset, discard, overwrite, or modify unrelated files
- do not push, merge to `main`, rebase, squash, or force-push unless explicitly requested

When a ticket requires multiple commits whose identities are part of the contract:

- preserve those commits separately
- never invent or manually guess commit SHAs or Git blob SHAs
- derive Git identities mechanically
- do not rewrite away a commit referenced by `sourceRevision`

If validation fails:

- investigate the failure
- do not weaken tests, validators, or contract assertions merely to make them pass
- do not create the next required commit until the current Gate is satisfied
