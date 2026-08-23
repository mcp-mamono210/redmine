
# ADR-004: Treat MCP tool definitions as public contract

Status: Accepted  
Date: 2026-08-23

## Context

Models choose tools using names, descriptions, and schemas. A metadata change
can therefore alter behavior even when TypeScript implementation signatures do
not change.

## Decision

Treat tool names, descriptions, input schemas, successful output shapes,
application error shapes, and documented bounds as public contract.

Exact contract facts live in:

```text
docs/contracts/read-only-mcp-contract.md
```

Contract changes require matching regression-test and documentation changes.

## Consequences

Tool metadata receives API-level review rather than being treated as harmless
copy editing.
