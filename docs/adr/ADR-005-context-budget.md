
# ADR-005: Treat context cost as a functional requirement

Status: Accepted  
Date: 2026-08-23

## Context

The primary benefit of a dedicated Redmine MCP server is not only safe API
access but also smaller, more task-specific context than exposing raw Redmine
data or a generic REST surface.

## Decision

Measure context cost deterministically using serialized UTF-8 bytes.

Primary measurements:

```text
tools/list
redmine_list_issues default
redmine_search default
redmine_get_issue core
redmine_get_issue + journals
redmine_get_issue + allowed_statuses
redmine_get_project stable envelope
```

List and search tools are bounded:

```text
redmine_list_issues default 10 / max 20
redmine_search      default 10 / max 20
```

`redmine_get_issue` omits optional associations by default.

`redmine_get_project` uses a stable envelope so future metadata can be added
without making every call perform every backend request.

Reference-token measurements may be added later, but UTF-8 bytes are the
deterministic CI metric.

No hard byte thresholds are introduced in v0.1.1.

## Consequences

Response size changes become observable before hard limits are introduced.
Future output-schema or structured-content work must be measured for
duplication cost.
