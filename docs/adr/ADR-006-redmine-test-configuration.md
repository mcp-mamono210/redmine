
# ADR-006: Use deterministic synthetic Redmine fixtures

Status: Accepted  
Date: 2026-08-23

## Context

Integration and MCP E2E tests require realistic permissions, workflows, and
representative Redmine data.

Production data would reduce reproducibility and create unnecessary security
risk.

## Decision

Use deterministic synthetic Redmine configuration and fixtures.

Separate configuration from representative data:

```text
docker/seed/config.rb
  -> settings, roles, permissions, workflow, metadata configuration

docker/seed/data.rb
  -> synthetic users, projects, issues, journals, relations, API token
```

Use non-admin test users.

Do not copy production tickets, credentials, or API keys into the test
environment.

Tests discover representative resources through stable semantic identifiers
rather than depending on database IDs.

## Consequences

Local and CI environments can be rebuilt repeatedly without production-state
dependencies.
