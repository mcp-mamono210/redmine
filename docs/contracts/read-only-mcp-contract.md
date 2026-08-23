# Read-only MCP Contract

Status: Released  
Contract version: v0.1.1  
Latest released version: v0.1.1  
Last synchronized: 2026-08-24

This document is the canonical documentation for the exact read-only MCP
behavior released in v0.1.1.

## Contract elements

The following are public MCP contract elements:

- tool name
- tool description
- input schema
- successful response shape
- application error shape
- pagination bounds
- include semantics

A change to any of these requires contract review and regression-test updates.

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

Successful tool responses are currently serialized as JSON in
`content[0].text`.

`outputSchema` and `structuredContent` are not part of this contract.

## Tool surface

The read-only MCP server exposes exactly these tools:

```text
redmine_get_current_user
redmine_get_issue
redmine_list_issues
redmine_get_project
redmine_list_projects
redmine_search
```

### `redmine_get_current_user`

Purpose: return the Redmine user associated with the configured API key.

Input:

```json
{}
```

### `redmine_list_issues`

Purpose: bounded structured issue discovery.

Supported input fields:

```text
project_id
tracker_id
status_id
assigned_to_id
fixed_version_id
subject
offset
limit
sort
```

Pagination:

```text
default limit = 10
maximum limit = 20
```

The `subject` filter is substring-based. The Redmine-specific `~` operator is
an internal transport detail and is not part of the MCP input.

Issue summaries contain only bounded discovery fields. They do not include
large detail associations such as descriptions, journals, relations,
attachments, or large custom-field payloads.

Pagination response fields:

```json
{
  "items": [],
  "total_count": 0,
  "offset": 0,
  "limit": 10
}
```

### `redmine_get_issue`

Purpose: retrieve issue detail after an issue ID is known.

Required input:

```json
{
  "issue_id": 42
}
```

The default response is core-only. Optional associations are absent unless
explicitly requested.

Supported public `include` values:

```text
journals
relations
children
attachments
allowed_statuses
```

Example:

```json
{
  "issue_id": 42,
  "include": [
    "journals",
    "allowed_statuses"
  ]
}
```

Semantics:

```text
include omitted
  -> optional association property is absent

include requested and Redmine returns an empty collection
  -> property is []

include requested but Redmine omits an empty section
  -> property may remain absent; treat it as zero entries
     (observed for children on Redmine 6.1.x)

attachments
  -> metadata only; file body is not fetched

allowed_statuses
  -> Redmine remains authoritative for available transitions
```

`watchers` is not part of the public include contract.

### `redmine_search`

Purpose: free-text resource discovery.

Required input:

```text
query
```

Optional input:

```text
project_id
offset
limit
```

Pagination:

```text
default limit = 10
maximum limit = 20
```

Search results are summaries. Issue detail should be retrieved only after an
issue ID has been selected.

### `redmine_list_projects`

Purpose: project discovery.

Supported input:

```text
offset
limit
```

Pagination:

```text
maximum limit = 100
```

The response contains project summaries only.

### `redmine_get_project`

Purpose: retrieve project detail and the currently supported project metadata.

Response envelope:

```json
{
  "project": {},
  "trackers": [],
  "categories": [],
  "custom_fields": [],
  "versions": null,
  "members": null,
  "priorities": null,
  "warnings": []
}
```

Semantics:

```text
null
  -> not fetched / not implemented by this contract

[]
  -> fetched successfully and no entries were returned
```

For this contract:

```text
trackers
categories
custom_fields
  -> populated from the Redmine Project API

versions
members
priorities
  -> reserved as null

warnings
  -> reserved for future partial-failure reporting and currently []
```

## Error contract

Application error codes:

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

HTTP 422 may expose bounded sanitized validation messages:

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

Validation details are bounded to at most 5 messages and 200 characters per
message.

API keys, Authorization values, passwords, raw backend bodies, stack traces,
and causes must not be returned to MCP clients.

## Context measurement

Context cost is measured using serialized UTF-8 bytes.

The exact measurement scenarios and current byte values are executable test
data and therefore live in:

```text
tests/e2e/context-measurement.test.ts
```

This contract intentionally does not duplicate measured byte values.

No hard byte threshold is part of the v0.1.1 contract.

## Regression coverage

The contract is protected by the read-only contract/workflow E2E tests and the
tool-specific unit, integration, and E2E tests.

When this document changes, the corresponding executable regression contract
must change in the same ticket.
