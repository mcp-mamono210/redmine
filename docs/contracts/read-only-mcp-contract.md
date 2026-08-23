
# Read-only MCP Contract

Status: Accepted for v0.1.1 development  
Last synchronized: 2026-08-23

This document defines the public read-only MCP contract. The TypeScript
`RedmineClient` is an internal API and is not itself the MCP contract.

## Contract elements

The following are treated as public contract elements:

- tool name
- tool description
- input schema
- successful response shape
- application error shape
- documented pagination and include limits

Changes to these elements require contract review and regression-test updates.

## Naming boundary

Public MCP inputs and successful JSON responses use `snake_case`.

Internal TypeScript models and the `RedmineClient` use `camelCase`.

Examples:

```text
MCP                       TypeScript
total_count               totalCount
assigned_to               assignedTo
fixed_version             fixedVersion
custom_fields             customFields
allowed_statuses          allowedStatuses
created_on                createdOn
```

Successful tool responses are currently returned as JSON text in
`content[0].text`.

`outputSchema` and `structuredContent` are not part of the v0.1.1 contract.

## Tool surface

The read-only server exposes exactly six tools:

```text
redmine_get_current_user
redmine_get_issue
redmine_list_issues
redmine_get_project
redmine_list_projects
redmine_search
```

Write tools are not part of this contract.

## `redmine_get_current_user`

Retrieves the Redmine user associated with the configured API key.

Input:

```json
{}
```

Representative response:

```json
{
  "id": 7,
  "login": "mcp-test",
  "firstname": "MCP",
  "lastname": "Test",
  "mail": "mcp-test@example.invalid"
}
```

## `redmine_list_issues`

Returns bounded issue summaries.

Default limit: `10`  
Maximum limit: `20`

Representative response:

```json
{
  "items": [
    {
      "id": 42,
      "subject": "Authentication fails for invalid API token",
      "project": {
        "id": 1,
        "name": "MCP Test Project"
      },
      "tracker": {
        "id": 1,
        "name": "Bug"
      },
      "status": {
        "id": 1,
        "name": "New",
        "is_closed": false
      },
      "priority": {
        "id": 3,
        "name": "High"
      },
      "assigned_to": {
        "id": 7,
        "name": "MCP Test"
      },
      "fixed_version": {
        "id": 5,
        "name": "v0.1.0"
      },
      "updated_on": "..."
    }
  ],
  "total_count": 1,
  "offset": 0,
  "limit": 10
}
```

Issue-list summaries intentionally exclude large detail fields such as:

```text
description
journals
relations
attachments
custom_fields
author
```

The `subject` filter is substring-based. The Redmine-specific `~` operator is
an internal transport detail and is not part of the MCP input.

## `redmine_get_issue`

The default call returns the issue core without optional associated data.

Input:

```json
{
  "issue_id": 42
}
```

Optional associated data is selected through `include`:

```json
{
  "issue_id": 42,
  "include": [
    "journals",
    "relations",
    "children",
    "attachments",
    "allowed_statuses"
  ]
}
```

Supported public include values:

```text
journals
relations
children
attachments
allowed_statuses
```

`watchers` is not part of the public MCP include contract.

Semantics:

- omitted include value: the corresponding response property is absent
- requested include with zero results: the corresponding response property is `[]`
- attachments contain metadata only; file content is not fetched
- `allowed_statuses` is supplied by Redmine and remains the authority for
  future status-transition validation

## `redmine_search`

Performs free-text discovery.

Default limit: `10`  
Maximum limit: `20`

Input:

```json
{
  "query": "authentication",
  "project_id": "mcp-test",
  "limit": 10
}
```

`project_id` is optional. Search results are summaries. Use
`redmine_get_issue` after discovering an issue ID when issue detail is needed.

Pagination uses:

```json
{
  "items": [],
  "total_count": 0,
  "offset": 0,
  "limit": 10
}
```

## `redmine_list_projects`

Returns project summaries visible to the configured Redmine user.

Maximum limit: `100`.

Representative response:

```json
{
  "items": [
    {
      "id": 1,
      "name": "MCP Test Project",
      "identifier": "mcp-test",
      "parent_id": 10
    }
  ],
  "total_count": 1,
  "offset": 0,
  "limit": 25
}
```

Detailed project metadata is not returned by this list tool.

## `redmine_get_project`

Returns a stable envelope.

```json
{
  "project": {
    "id": 1,
    "identifier": "mcp-test",
    "name": "MCP Test Project",
    "description": "...",
    "status": 1,
    "is_public": false,
    "created_on": "...",
    "updated_on": "..."
  },
  "trackers": [],
  "categories": [],
  "custom_fields": [],
  "versions": null,
  "members": null,
  "priorities": null,
  "warnings": []
}
```

Envelope semantics:

```text
null = not fetched / not implemented at this phase
[]   = fetched successfully and no entries were returned
```

In v0.1.1 development:

- `trackers`, `categories`, and `custom_fields` are populated from the Redmine
  Project API
- `versions`, `members`, and `priorities` are reserved and remain `null`
- `warnings` is reserved for future partial-failure reporting and is `[]`

## Error contract

MCP application errors use a stable sanitized shape:

```json
{
  "code": "validation_error",
  "message": "Redmine rejected the request.",
  "status": 422,
  "details": {
    "errors": [
      "Subject can't be blank"
    ]
  }
}
```

Mappings:

```text
401                     -> authentication_failed
403                     -> permission_denied
404                     -> not_found
422                     -> validation_error
other 4xx               -> invalid_request
5xx                     -> backend_unavailable
network / timeout       -> backend_unavailable
invalid JSON / schema   -> invalid_backend_response
unexpected error        -> internal_error
```

Validation details are bounded and sanitized. API keys, authorization values,
passwords, raw response bodies, stack traces, and causes must not be returned
to the MCP client.

## Context-cost contract

Context efficiency is a functional requirement.

Deterministic measurements use UTF-8 byte length of the serialized MCP result.
The current measurement suite covers:

```text
tools/list
redmine_list_issues default
redmine_search default
redmine_get_issue core
redmine_get_issue + journals
redmine_get_issue + allowed_statuses
redmine_get_project stable envelope
```

No hard byte threshold is defined in v0.1.1. Measurements establish a baseline
for later budget gates.

## Regression coverage

The public contract is protected by:

```text
tests/e2e/read-only-contract.test.ts
tests/e2e/read-only-workflow.test.ts
tests/e2e/issues.test.ts
tests/e2e/projects.test.ts
tests/e2e/search.test.ts
tests/e2e/context-measurement.test.ts
tests/unit/serialize.test.ts
```

A contract change must update this document and the relevant regression tests
in the same change.
