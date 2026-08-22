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
search
```

External Redmine JSON enters the application as `unknown` and is validated with Zod before it is exposed as typed TypeScript data.

## Search API

The Search API supports:

- Global Redmine search
- Project-scoped search
- Project identifiers and numeric project IDs
- Search pagination
- Typed search results
- Empty-query validation

Search results are discovery data. When full Issue data is needed, use the search result ID with the Issue API.

Example flow:

```text
search()
↓
result.id
↓
getIssue()
```

The API key is sent only through the `X-Redmine-API-Key` request header and is not added to search URLs.

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

Search integration coverage includes global search, project-scoped search, subject and description discovery, pagination, empty queries, missing projects, and API-key leak regression checks.

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
