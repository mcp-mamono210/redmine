
# ADR-004: Treat MCP tool definitions as public contract

Status: Accepted  
Date: 2026-08-23

## Context

Models choose tools using names, descriptions, and schemas. A seemingly small
description or schema change can therefore change runtime behavior even when
the TypeScript function signature is unchanged.

## Decision

Treat the following as public MCP contract elements:

```text
tool name
description
input schema
successful response shape
application error shape
documented bounds and include semantics
```

Descriptions must state the tool's intended workflow role, important bounds,
and when another tool should be preferred.

Contract changes require:

1. contract review
2. regression-test updates
3. documentation updates

The exact read-only names, descriptions, and input schemas are checked through
`tests/e2e/read-only-contract.test.ts`.

## Consequences

Tool metadata changes receive the same scrutiny as API changes. This reduces
silent behavior drift in MCP hosts and models.
