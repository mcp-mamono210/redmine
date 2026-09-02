
# Architecture Decision Records

This directory contains architecture decisions for the Redmine MCP Server.

For exact public MCP behavior, read:

```text
docs/contracts/read-only-mcp-contract.md
```

ADRs explain **why** a design was chosen. They should not duplicate exact tool
lists, pagination limits, include values, or response field inventories from
the contract document.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| ADR-001 | Use stdio as the MCP transport | Accepted |
| ADR-002 | Pin reproducible dependencies and runtime boundaries | Accepted |
| ADR-003 | Keep a small domain-oriented MCP tool surface | Accepted |
| ADR-004 | Treat MCP tool definitions as public contract | Accepted |
| ADR-005 | Treat context cost as a functional requirement | Accepted |
| ADR-006 | Use deterministic synthetic Redmine fixtures | Accepted |
| ADR-007 | Enforce a read-only least-privilege security boundary | Accepted |
| ADR-008 | Keep distribution independent from public registry publication | Accepted |
| ADR-009 | Use JSON text responses before structured output | Superseded by ADR-011 |
| ADR-010 | Provide deterministic local Redmine lifecycle commands | Accepted |
| ADR-011 | Publish outputSchema and structuredContent for Read-only Tools | Accepted |

## Status values

Use one of:

```text
Proposed
Accepted
Superseded by ADR-NNN
Rejected
```

## Superseding an ADR

Do not rewrite an Accepted ADR so that its original decision disappears.

When a material architectural decision changes:

1. create a new ADR describing the new context and decision
2. change the old ADR status to `Superseded by ADR-NNN`
3. add the new ADR to this index
4. update the public contract if externally observable behavior changed

Minor wording corrections that do not change the decision do not require a new
ADR.

## Documentation precedence

If documents disagree:

```text
Public contract facts
  -> docs/contracts/read-only-mcp-contract.md

Decision rationale
  -> relevant ADR

Implementation
  -> source and regression tests must implement the contract
```

A disagreement between the contract and implementation is a defect and should
be resolved explicitly rather than guessed around.
