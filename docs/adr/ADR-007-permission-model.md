
# ADR-007: Enforce a read-only least-privilege security boundary

Status: Accepted  
Date: 2026-08-23

## Context

MCP validation is not a substitute for backend authorization. The Redmine
account itself must constrain what a compromised or incorrectly implemented
tool can do.

## Decision

For the read-only architecture:

- use a dedicated non-admin Redmine user
- use a dedicated read-only Redmine role
- grant only the permissions required for read operations
- do not expose write tools
- sanitize credential-like values from MCP errors
- keep Redmine as the authorization authority

Do not extend the read-only role to gain write capability.

## Consequences

A future write architecture must introduce a separate writer boundary.

When write capability becomes an accepted architecture, create a new ADR and
mark this ADR `Superseded by ADR-NNN` rather than editing this decision into a
mixed read/write policy.
