# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

## RedmineClient error model

RedmineClient separates failures into three main categories:

```text
RedmineNetworkError
RedmineHttpError
RedmineResponseError
```

`RedmineNetworkError` represents failures that occur before a valid HTTP response is received, including connection failures and request timeouts.

`RedmineHttpError` represents non-success HTTP responses and preserves the HTTP status, method, request path, and Redmine `errors[]` messages when available.

`RedmineResponseError` represents successful HTTP responses that cannot be safely consumed, including empty bodies, invalid JSON, and schema validation failures.

API keys are never included in RedmineClient error messages.

## Error regression tests

Deterministic unit tests cover:

- HTTP 403 and 5xx responses
- Redmine `errors[]` extraction
- Empty response bodies
- Invalid JSON
- Zod schema mismatches
- Network failures
- Request timeouts
- API-key leak regression

Real Docker Redmine integration tests cover:

- HTTP 401 with an invalid API key
- HTTP 404 for a missing issue
- Current-user API-key sanitization
- Search URL API-key regression

Run unit tests with the existing Vitest dependency:

```bash
npx vitest run tests/unit
```

Run integration tests after resetting Redmine:

```bash
npm run redmine:reset
npm run test:integration
```

Run the complete existing quality gates:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

## Testability

`RedmineClientOptions` accepts an optional `fetchImpl` dependency. Production code uses the global `fetch` implementation by default. Tests can inject deterministic HTTP behavior without changing the Docker Redmine environment.

## License

MIT
