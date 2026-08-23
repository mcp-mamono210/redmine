
# ADR-002: Pin reproducible dependencies and runtime boundaries

Status: Accepted  
Date: 2026-08-23

## Context

The MCP server depends on npm packages and a deterministic Docker Redmine test
environment. Uncontrolled dependency movement would make contract regressions
difficult to reproduce.

## Decision

Use explicit dependency versions and lockfiles.

Current important boundaries include:

```text
@modelcontextprotocol/server  2.0.0
@modelcontextprotocol/client  2.0.0
zod                          4.4.3
TypeScript                    6.0.3
Vitest                        3.2.4
Redmine                       6.1.3
PostgreSQL                    17.10
```

`package-lock.json` is authoritative for npm resolution.

The Node runtime itself is not yet pinned by this ADR implementation. Runtime
pinning is a separate v0.1.1 task and must be completed before the stable v1
contract.

## Consequences

Dependency upgrades are explicit reviewable changes. The project avoids
silently redefining the MCP contract through dependency drift.
