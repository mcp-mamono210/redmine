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
│       └── issues.ts
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

`redmine_list_issues` is intended for structured filtering. Free-text discovery will be provided by `redmine_search`.

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

The Current User and Issue E2E tests include API-key leak regression coverage.

## License

MIT
