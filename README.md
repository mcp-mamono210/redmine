# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

The current development target is **v0.1.0**, which establishes the read-only MCP tool surface.

## MCP tool structure

Read-only MCP tools are separated from the server composition root.

```text
src/
├── mcp/
│   ├── errors.ts
│   ├── register-tools.ts
│   └── tools/
│       ├── current-user.ts
│       ├── issues.ts
│       ├── projects.ts
│       └── search.ts
├── redmine/
│   └── ...
└── server.ts
```

Responsibilities are separated as follows:

- `src/server.ts` creates the MCP server and delegates read-only tool registration.
- `src/mcp/register-tools.ts` is the shared registration entry point for read-only tools.
- `src/mcp/tools/` contains individual MCP tool definitions and handlers.
- `src/mcp/errors.ts` contains shared MCP application error mapping.

External MCP parameters use `snake_case` while the internal TypeScript `RedmineClient` API uses `camelCase`.

## Current tools

### `redmine_get_current_user`

Retrieves the Redmine user associated with the configured API key.

Use this tool to verify Redmine authentication and determine the identity and internal user ID used by the MCP server. It does not search for arbitrary Redmine users.

### `redmine_get_issue`

Retrieves detailed information for a Redmine issue when its numeric issue ID is known.

Input:

```json
{
  "issue_id": 123
}
```

The response includes journals and issue relations when available.

### `redmine_list_issues`

Lists Redmine issues using structured filters and pagination.

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

All parameters are optional. `limit` is constrained to 1-100.

Example:

```json
{
  "project_id": "mcp-test",
  "status_id": "open",
  "limit": 25
}
```

The response preserves Redmine pagination information:

```json
{
  "items": [],
  "totalCount": 0,
  "offset": 0,
  "limit": 25
}
```

`redmine_list_issues` is intended for structured filtering. Use `redmine_search` for free-text discovery.

### `redmine_get_project`

Retrieves detailed project metadata when the Redmine project ID or identifier is known.

Input by identifier:

```json
{
  "project_id": "mcp-test"
}
```

A positive numeric project ID is also accepted.

The response includes project metadata available through the Redmine Project API, including:

```text
trackers
issue categories
issue custom fields
```

Project versions and memberships are not aggregated by this tool.

### `redmine_list_projects`

Lists projects visible to the configured Redmine user using pagination.

Supported parameters:

```text
offset
limit
```

Both parameters are optional. `limit` is constrained to 1-100.

Example:

```json
{
  "offset": 0,
  "limit": 25
}
```

Use `redmine_list_projects` to discover a project ID or identifier, then call `redmine_get_project` when detailed metadata is required.

### `redmine_search`

Searches Redmine by free text for resource discovery.

Supported parameters:

```text
query
project_id
offset
limit
```

`query` is required. `project_id`, `offset`, and `limit` are optional. `limit` is constrained to 1-100.

Global search example:

```json
{
  "query": "authentication",
  "limit": 25
}
```

Project-scoped search example:

```json
{
  "query": "authentication",
  "project_id": "mcp-test",
  "limit": 25
}
```

Use `redmine_search` when the resource ID is unknown. Search results are summaries; after discovering an issue ID, call `redmine_get_issue` for complete issue details.

Use `redmine_list_issues` instead when structured issue filters such as project, tracker, status, assignee, or fixed version are already known.

## Read-only workflows

The v0.1.0 read-only tool surface is designed around discovery followed by detailed retrieval.

Free-text issue discovery:

```text
redmine_search
↓
discover an issue ID
↓
redmine_get_issue
```

Structured issue discovery:

```text
redmine_list_issues
↓
select an issue ID
↓
redmine_get_issue
```

Project discovery:

```text
redmine_list_projects
↓
select a project identifier
↓
redmine_get_project
```

Project-scoped search is available by passing `project_id` to `redmine_search`.

## Error model

Errors are separated into three layers:

```text
Redmine failure
↓
RedmineClient typed error
↓
MCP application error
↓
sanitized MCP tool result
```

RedmineClient continues to use:

```text
RedmineNetworkError
RedmineHttpError
RedmineResponseError
```

The MCP layer maps these failures to stable application error codes:

```text
authentication_failed
permission_denied
not_found
invalid_request
backend_unavailable
invalid_backend_response
internal_error
```

The MCP response exposes only a stable error code, a sanitized message, and an HTTP status when appropriate.

Raw Redmine response bodies, stack traces, causes, and API keys are not returned to MCP clients.

## Example error

```json
{
  "code": "not_found",
  "message": "The requested Redmine resource was not found.",
  "status": 404
}
```

## Error mapping

```text
401                     -> authentication_failed
403                     -> permission_denied
404                     -> not_found
other 4xx               -> invalid_request
5xx                     -> backend_unavailable
network / timeout       -> backend_unavailable
invalid JSON / schema   -> invalid_backend_response
unexpected error        -> internal_error
```

## Tests

Run unit tests with:

```bash
npm run test:unit
```

Run MCP E2E tests with the deterministic Redmine test environment and required environment variables configured:

```bash
npm run test:e2e
```

The read-only E2E suite fixes the v0.1.0 public tool contract at these six tools:

```text
redmine_get_current_user
redmine_get_issue
redmine_list_issues
redmine_get_project
redmine_list_projects
redmine_search
```

The suite verifies Current User, Issue, Project, global Search, project-scoped Search, Search-to-Issue, structured Issue-list-to-detail, and Project-list-to-detail workflows over stdio.

The deterministic Docker Redmine seed is used to discover resource IDs during tests instead of depending on fixed seeded database IDs. API-key leak regression coverage remains part of the E2E quality gate.

## License

MIT
