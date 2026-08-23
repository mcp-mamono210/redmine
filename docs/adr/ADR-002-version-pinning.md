
# ADR-002: Pin reproducible dependencies and runtime boundaries

Status: Accepted  
Date: 2026-08-23

## Context

Runtime and dependency drift can change build, lint, test, and MCP behavior
without a source-code change.

## Decision

Use explicit reproducibility boundaries:

- `.nvmrc` is the source of truth for the exact Node.js runtime
- `package.json` declares the supported runtime requirement
- `package-lock.json` is authoritative for npm dependency resolution
- CircleCI installs and verifies the runtime from `.nvmrc`
- Docker images used for deterministic Redmine testing are explicitly pinned

Do not repeat the exact Node.js version or the full dependency inventory in
this ADR. Those values belong to their executable configuration files.

## Consequences

Runtime and dependency upgrades become explicit reviewed changes.

The CircleCI operating-system image is a separate reproducibility boundary and
may be pinned independently when required.
