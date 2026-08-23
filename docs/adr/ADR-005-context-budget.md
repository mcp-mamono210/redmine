
# ADR-005: Treat context cost as a functional requirement

Status: Accepted  
Date: 2026-08-23

## Context

A primary reason for using a dedicated Redmine MCP server is to provide the
model with less irrelevant data than a raw or generic Redmine API surface.

Correctness and security are insufficient if normal workflows consume
unbounded context.

## Decision

Treat context efficiency as a functional requirement.

- use compact discovery responses
- request detail only when needed
- make expensive optional associations explicit
- measure serialized UTF-8 bytes deterministically
- measure `tools/list` as well as tool responses
- defer hard thresholds until enough baseline data exists

Exact pagination bounds and include values belong only in the contract
document.

Exact measurement scenarios and byte values belong in the executable context
measurement test.

## Consequences

Context growth becomes observable and reviewable.

Future changes such as structured output must account for duplication and
serialized-size impact before adoption.
