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
│       └── current-user.ts
├── redmine/
│   └── ...
└── server.ts
```

Responsibilities are separated as follows:

- `src/server.ts` creates the MCP server and delegates read-only tool registration.
- `src/mcp/register-tools.ts` is the shared registration entry point for read-only tools.
- `src/mcp/tools/` contains individual MCP tool definitions and handlers.
- `src/mcp/errors.ts` contains shared MCP application error mapping.

Future read-only tools use `snake_case` for external MCP parameters while the internal TypeScript `RedmineClient` API continues to use `camelCase`.

## Current tool

### `redmine_get_current_user`

Retrieves the Redmine user associated with the configured API key.

Use this tool to verify Redmine authentication and determine the identity and internal user ID used by the MCP server. It does not search for arbitrary Redmine users.

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
  "code": "authentication_failed",
  "message": "Redmine authentication failed.",
  "status": 401
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

The Current User E2E API-key leak regression remains part of the quality gate.

## License

MIT
