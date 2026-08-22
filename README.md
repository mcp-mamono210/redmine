# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

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

Unit tests verify the mapping and sanitization contract.

```bash
npm run test:unit
```

MCP E2E tests verify that an invalid Redmine API key produces a sanitized error over stdio.

```bash
npm run test:e2e
```

The existing Current User E2E API-key leak regression remains part of the quality gate.

## License

MIT
