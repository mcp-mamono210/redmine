
# ADR-009: Use snake_case JSON text responses before structured output

Status: Accepted  
Date: 2026-08-23

## Context

The MCP SDK supports richer output contracts, but adopting `outputSchema` and
`structuredContent` can duplicate information if text JSON is also retained.
That duplication directly affects context cost.

The internal Redmine client uses idiomatic TypeScript `camelCase`, while the
public MCP contract should be independent from internal naming.

## Decision

For v0.1.1:

- successful tool results are JSON serialized into `content[0].text`
- public JSON keys use `snake_case`
- internal TypeScript models remain `camelCase`
- conversion occurs at the MCP serialization boundary
- error objects keep their existing stable application-error shape
- do not add `outputSchema` or `structuredContent` yet

The exact public response contract is documented in
`docs/contracts/read-only-mcp-contract.md`.

`outputSchema` / `structuredContent` are deferred until their context-cost
impact is measured.

## Consequences

The public naming contract is stable without forcing internal TypeScript models
to mirror wire-format names. Structured output remains a deliberate later
contract change.
