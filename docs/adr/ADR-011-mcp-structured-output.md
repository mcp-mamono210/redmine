# ADR-011: Publish outputSchema and structuredContent for Read-only Tools

Status: Accepted  
Date: 2026-09-03

## Context

ADR-009 intentionally kept the initial Read-only MCP contract on JSON text
responses while structured output behavior and context cost were still
unsettled.

The current v0.2.0 implementation has since established a different contract:

- every published Read-only Tool declares an `outputSchema`
- successful Tool results contain `structuredContent`
- `content[0].text` remains available as JSON
- both successful representations are produced from the same public object
- public field names remain `snake_case`
- regression tests verify that text JSON and `structuredContent` are equivalent

Keeping ADR-009 as the active decision would therefore contradict the current
implementation and executable regression contract.

## Decision

For the v0.2.0 Read-only MCP contract:

- publish `outputSchema` for every currently published Read-only Tool
- return `structuredContent` for successful Tool calls
- retain JSON text in `content[0].text`
- generate both successful representations from the same public MCP object
- require public field names to remain `snake_case` in both representations
- keep internal TypeScript models free to use `camelCase`
- keep the existing bounded, sanitized application error envelope separate
  from the successful structured-output contract
- treat changes to a Tool's successful output schema as public contract changes
  requiring contract review and regression-test updates

The exact Tool list, response field inventory, and public schema details remain
defined by `docs/contracts/read-only-mcp-contract.md` and executable regression
tests rather than duplicated in this ADR.

## Consequences

Clients that support MCP structured output can consume successful Tool results
without reparsing JSON text.

JSON text remains available for compatibility and human-readable inspection.

Because both successful representations carry equivalent data, response size
can increase compared with the ADR-009 design. Context-cost regression
measurement remains responsible for detecting material growth; this ADR does
not redefine Context Budget thresholds or baseline policy.

ADR-009 is superseded by this decision.
