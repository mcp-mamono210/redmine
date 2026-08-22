# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

## RedmineClient

The read-only RedmineClient currently provides:

```text
getCurrentUser
getIssue
listIssues
getProject
listProjects
listProjectVersions
listProjectMemberships
```

External Redmine JSON enters the application as `unknown` and is validated with Zod before it is exposed as typed TypeScript data.

## Project API

The Project API supports:

- Project detail retrieval
- Project listing
- Project pagination
- Project trackers
- Project issue custom field metadata
- Project versions
- Project memberships

Project identifiers and numeric project IDs are both supported.

The client does not depend on global admin-only `/users` or `/custom_fields` endpoints for project metadata.

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

The integration tests cover current-user, Issue API, Project API, versions, memberships, pagination, and typed 404 errors.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:integration
npm run test:e2e
```

## License

MIT
