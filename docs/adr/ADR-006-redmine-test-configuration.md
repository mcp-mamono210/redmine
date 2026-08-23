
# ADR-006: Use deterministic synthetic Redmine configuration and fixtures

Status: Accepted  
Date: 2026-08-23

## Context

Reliable integration and MCP E2E tests require realistic Redmine permissions,
workflow configuration, and representative data. Copying production data is
unnecessary and creates security and reproducibility problems.

## Decision

Keep Redmine test setup split by responsibility:

```text
docker/seed/config.rb
  -> settings, trackers, statuses, priorities, custom fields, roles, workflow

docker/seed/data.rb
  -> synthetic users, projects, versions, issues, journals, relations, API token
```

Use a non-admin `mcp-test` user and deterministic synthetic fixtures.

Never copy production tickets, credentials, or production API keys into the
test environment.

Fixture IDs are not part of the test contract. E2E tests discover resources
using stable identifiers and subjects.

## Consequences

The environment can be reset repeatedly and produces stable test semantics
without depending on production state.
