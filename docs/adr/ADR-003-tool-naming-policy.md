
# ADR-003: Keep a small domain-oriented MCP tool surface

Status: Accepted  
Date: 2026-08-23

## Context

Every exposed tool increases `tools/list` context cost and gives the model
another possible action path.

A generic CRUD or arbitrary REST surface would expose implementation details
and increase ambiguity without improving the intended Redmine workflows.

## Decision

Expose a small domain-oriented Redmine tool surface.

- discovery/list operations stay separate from detail retrieval
- tool names use the Redmine domain and stable task-oriented verbs
- do not add generic CRUD, arbitrary REST, or delete tools for v1
- evaluate new tools against workflow value and context cost

The exact current tool inventory is defined only in
`docs/contracts/read-only-mcp-contract.md`.

## Consequences

The public surface stays easier for models and humans to reason about.

Adding a new tool is a contract change, not merely an internal helper addition.
