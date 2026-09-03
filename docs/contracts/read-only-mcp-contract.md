# Read-only MCP Contract

Status: v0.2.0 release candidate
Contract target: v0.2.0
Latest released version: v0.1.1
Last synchronized: 2026-09-03

This document is the canonical documentation for the exact read-only MCP
behavior targeted by the v0.2.0 release candidate. v0.1.1 remains the latest
released version until the final release operation is completed.

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

Successful Read-only Tool responses expose the same public object in two
representations:

- JSON serialized in `content[0].text`
- MCP `structuredContent`

Every currently published Read-only Tool declares an `outputSchema`.

The JSON text and `structuredContent` MUST represent the same public data.
Both representations use the same `snake_case` field names defined by the
public MCP contract. Internal TypeScript `camelCase` names remain an
implementation detail.

Application errors keep the existing error contract: the tool result is marked
with `isError: true` and the bounded, sanitized application error envelope is
serialized in text content. The successful `outputSchema` /
`structuredContent` contract does not redefine the error envelope.

## Structured output contract

The six currently published Read-only Tools expose `outputSchema` in
`tools/list` and return `structuredContent` on successful calls.

Contract requirements:

```text
outputSchema
  -> describes the successful public response object for the Tool

content[0].text
  -> JSON serialization of the successful public response object

structuredContent
  -> the same successful public response object represented structurally

public field naming
  -> snake_case in both text JSON and structuredContent

internal TypeScript naming
  -> camelCase is allowed internally but must not leak into either public
     representation
```

For a successful Tool call, parsing `content[0].text` as JSON MUST produce a
value equivalent to `structuredContent`.

Schema changes that alter a public successful response shape require contract
review and corresponding regression-test updates.

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

Purpose: retrieve project detail and bounded aggregated project metadata.

Response envelope:

```json
{
  "project": {},
  "trackers": [],
  "categories": [],
  "custom_fields": [],
  "versions": [],
  "members": [],
  "priorities": [],
  "warnings": []
}
```

The envelope keys are stable. `versions`, `members`, and `priorities` are
nullable because each optional metadata request can fail independently.

Value semantics:

```text
[]
  -> the metadata request succeeded and returned zero entries

null
  -> the corresponding optional metadata request failed

non-empty array
  -> the metadata request succeeded and returned entries
```

Metadata sources:

```text
trackers
categories
custom_fields
  -> populated with the core Redmine Project request

versions
  -> populated from the project versions request

members
  -> populated from the project memberships request
     using one bounded page with limit = 100

priorities
  -> populated from the issue-priorities request
```

Optional metadata is aggregated independently. A failure while retrieving
`versions`, `members`, or `priorities` does not fail the whole Tool call after
the core project has been retrieved successfully. The failed field remains
`null`, successfully retrieved metadata remains available, and `warnings`
contains a bounded public warning.

The current unavailable warning strings are:

```text
versions: unavailable
members: unavailable
priorities: unavailable
```

Multiple optional metadata failures are reported independently in `warnings`.
Backend exception messages, API keys, Authorization values, and other secret
details must not be copied into these warnings.

Membership aggregation is intentionally bounded to one page. If Redmine
reports more memberships than were returned in that bounded page, the returned
`members` array contains the retrieved entries and `warnings` includes:

```text
members: truncated to <returned_count> of <total_count>
```

A failure of the core project request is not a partial result. It fails the Tool
call through the normal public error contract.

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

No per-response hard byte limit is part of the v0.2.0 contract. The committed
baseline, regression thresholds, scenario policy, and release gate are defined
in [`docs/context-budget.md`](../context-budget.md).

## Regression coverage

The contract is protected by the read-only contract/workflow E2E tests, the
structured-output E2E tests, and the tool-specific unit, integration, and E2E
tests.

In particular, regression coverage verifies that all published Read-only Tools
declare `outputSchema` and that successful text JSON and `structuredContent`
remain equivalent.

When this document changes, the corresponding executable regression contract
must change in the same ticket.
