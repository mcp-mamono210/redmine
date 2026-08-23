
# ADR-003: Keep a small domain-oriented MCP tool surface

Status: Accepted  
Date: 2026-08-23

## Context

A large generic CRUD surface increases `tools/list` context cost and gives the
model more ambiguous ways to perform the same task.

## Decision

Use domain-oriented tool names with the `redmine_` prefix and `snake_case`.

Current read-only tools:

```text
redmine_get_current_user
redmine_get_issue
redmine_list_issues
redmine_get_project
redmine_list_projects
redmine_search
```

The planned write surface is intentionally narrow:

```text
redmine_create_issue
redmine_update_issue
redmine_add_issue_note
```

Do not add generic delete, arbitrary REST, or generic CRUD tools for v1.

List/search tools perform discovery; get tools perform detail retrieval.

## Consequences

The tool surface remains easier to reason about and cheaper to expose to the
model. Adding a tool requires justification against both workflow value and
`tools/list` context cost.
