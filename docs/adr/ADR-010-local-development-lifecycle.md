
# ADR-010: Provide deterministic local Redmine lifecycle commands

Status: Accepted  
Date: 2026-08-23

## Context

Integration and E2E tests require a reproducible Redmine instance that can be
started, seeded, reset, and stopped without manual database manipulation.

## Decision

Expose the lifecycle through npm scripts:

```text
npm run redmine:start
npm run redmine:seed
npm run redmine:reset
npm run redmine:stop
```

`redmine:reset` is the authoritative clean rebuild path for tests that require
a deterministic initial state.

The lifecycle uses `docker/compose.yml` and the separated configuration/data
seed scripts defined by ADR-006.

## Consequences

Local development and CI use the same lifecycle concepts. Tests can recover
from mutable Redmine state without relying on manual cleanup.
