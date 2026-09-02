
# ADR-009: Use JSON text responses before structured output

Status: Superseded by ADR-011  
Date: 2026-08-23

## Context

Richer MCP output mechanisms can improve machine readability, but using them
together with equivalent JSON text can duplicate payload and increase context
cost.

The public wire format should also remain independent from internal TypeScript
naming.

## Decision

For the current read-only contract:

- successful results use JSON serialized in MCP text content
- public JSON uses `snake_case`
- internal TypeScript remains `camelCase`
- conversion occurs at the MCP serialization boundary
- do not introduce `outputSchema` or `structuredContent` yet

The exact public response contract is defined only in
`docs/contracts/read-only-mcp-contract.md`.

## Consequences

The public naming boundary is stable without coupling internal TypeScript
models to wire names.

Structured output remains a deliberate future contract decision whose context
cost must be measured first.
