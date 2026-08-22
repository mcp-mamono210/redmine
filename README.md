# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

## RedmineClient

The read-only RedmineClient currently provides:

```text
getCurrentUser
getIssue
listIssues
```

Existing current-user support is preserved while the Issue API is added.

External Redmine JSON enters the application as `unknown` and is validated with Zod before it is exposed as typed TypeScript data.

## Issue API

The Issue API supports:

- Issue detail retrieval
- Issue listing
- Project filtering
- Tracker filtering
- Status filtering
- Assignee filtering
- Fixed-version filtering
- Subject filtering
- Pagination
- Sorting
- Custom fields
- Journals
- Relations
- Allowed statuses

Redmine REST snake_case fields are normalized to camelCase at the client boundary.

## Integration tests

Prepare a clean representative Redmine environment:

```bash
npm run redmine:reset
```

Then run:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"

npm run test:integration
```

The integration tests cover the existing current-user contract and the Issue API contract.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## License

MIT
