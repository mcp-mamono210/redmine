
# ADR-007: Enforce least privilege at Redmine and MCP boundaries

Status: Accepted  
Date: 2026-08-23

## Context

MCP-level validation is not a substitute for backend authorization. A
misconfigured or bypassed tool must still be constrained by the Redmine user
and role.

## Decision

For the read-only release:

- use a dedicated non-admin Redmine user
- use the `MCP Read Only` role
- grant only permissions needed to view projects and issues
- keep write tools absent from the exposed tool surface
- sanitize API keys and credential-like values from MCP errors

Future writes must use a separate writer role/user and a write-enable guard.
The read-only role must not be expanded into a writer role.

Redmine remains the authority for permissions and workflow transitions.

## Consequences

Security does not depend on model compliance. Future write functionality can
be added without weakening the read-only security boundary.
