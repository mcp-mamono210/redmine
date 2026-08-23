
# Redmine MCP Server

Redmine MCP Server is a TypeScript Model Context Protocol (MCP) server for
Redmine.

The current stable release is **v0.1.0**. The repository is preparing the
**v0.1.1 Read-only Contract Alignment** release.

## Design goals

The server is designed around three requirements:

```text
Correct
+
Secure
+
Context-efficient
```

The MCP surface intentionally exposes domain-oriented Redmine operations
instead of a generic REST/CRUD interface.

## Architecture

```text
src/
├── mcp/
│   ├── errors.ts
│   ├── register-tools.ts
│   ├── serialize.ts
│   └── tools/
│       ├── current-user.ts
│       ├── issues.ts
│       ├── projects.ts
│       └── search.ts
├── redmine/
│   ├── client.ts
│   ├── errors.ts
│   ├── schemas.ts
│   └── types.ts
└── server.ts
```

Responsibilities:

- `src/redmine/` handles Redmine HTTP transport, runtime validation, and
  internal TypeScript models.
- `src/mcp/tools/` defines the public MCP tools and workflow-oriented bounds.
- `src/mcp/serialize.ts` converts internal `camelCase` values to public
  `snake_case` JSON.
- `src/mcp/errors.ts` maps backend failures to sanitized MCP application
  errors.
- stdout is reserved for MCP protocol traffic.

## Public contract

The authoritative read-only contract is:

```text
docs/contracts/read-only-mcp-contract.md
```

Architecture decisions are recorded under:

```text
docs/adr/
```

Public MCP inputs and successful response JSON use `snake_case`. Internal
TypeScript and `RedmineClient` models use `camelCase`.

## Current read-only tools

```text
redmine_get_current_user
redmine_get_issue
redmine_list_issues
redmine_get_project
redmine_list_projects
redmine_search
```

### `redmine_get_current_user`

Returns the Redmine user associated with the configured API key.

### `redmine_list_issues`

Lists bounded issue summaries using structured filters.

Supported parameters:

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

`limit` defaults to `10` and has a maximum of `20`.

The `subject` filter is substring-based.

Representative pagination:

```json
{
  "items": [],
  "total_count": 0,
  "offset": 0,
  "limit": 10
}
```

Large detail fields such as description, journals, relations, attachments, and
custom fields are excluded from list summaries.

### `redmine_get_issue`

Returns issue core information when a numeric issue ID is known.

Default input:

```json
{
  "issue_id": 123
}
```

Optional associated data can be requested explicitly:

```json
{
  "issue_id": 123,
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

Optional properties are absent when not requested. If an association is
requested successfully and has zero entries, the response contains `[]`.

Attachments are metadata only; file content is not downloaded.

### `redmine_search`

Performs free-text discovery globally or within one project.

```json
{
  "query": "authentication",
  "project_id": "mcp-test",
  "limit": 10
}
```

`query` is required. `limit` defaults to `10` and has a maximum of `20`.

Search results are summaries. Use `redmine_get_issue` after discovering an
issue ID when detail is required.

### `redmine_list_projects`

Lists visible project summaries.

Supported parameters:

```text
offset
limit
```

`limit` has a maximum of `100`.

Use this tool to discover a project identifier before calling
`redmine_get_project`.

### `redmine_get_project`

Returns project information in a stable envelope:

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
null = not fetched / not implemented at this phase
[]   = fetched successfully and empty
```

In the current v0.1.1 development contract, `trackers`, `categories`, and
`custom_fields` are populated. `versions`, `members`, and `priorities` are
reserved as `null`. `warnings` is reserved for later partial-failure reporting.

## Read-only workflows

Free-text issue discovery:

```text
redmine_search
↓
redmine_get_issue
```

Structured issue discovery:

```text
redmine_list_issues
↓
redmine_get_issue
```

Project discovery:

```text
redmine_list_projects
↓
redmine_get_project
```

The list/search step is intentionally compact. Detail is requested only after a
resource has been selected.

## Error model

```text
Redmine failure
↓
RedmineClient typed error
↓
MCP application error
↓
sanitized MCP tool result
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

Example validation error:

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

Validation details are bounded and sanitized. Raw response bodies, stack
traces, causes, API keys, authorization values, and passwords are not exposed
to MCP clients.

## Context measurement

Context efficiency is measured deterministically using serialized UTF-8 bytes.

Run the current measurement baseline with:

```bash
npm run context:measure
```

The suite measures:

```text
tools/list
redmine_list_issues default
redmine_search default
redmine_get_issue core
redmine_get_issue + journals
redmine_get_issue + allowed_statuses
redmine_get_project stable envelope
```

v0.1.1 records a baseline; hard byte thresholds are deferred until sufficient
measurements exist.

## Local Redmine lifecycle

```bash
npm run redmine:start
npm run redmine:seed
npm run redmine:reset
npm run redmine:stop
```

The Docker environment uses synthetic deterministic fixtures. Production
Redmine data is not copied into the test environment.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

The E2E suite protects the six-tool read-only surface, workflow behavior,
response contracts, API-key non-leak guarantees, and context measurement
baseline.

## License

MIT
