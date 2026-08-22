# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

The project is progressing toward `v0.1.0`, which expands the initial walking skeleton into a read-only MCP server.

## Configuration seed

Redmine configuration is managed as code in:

```text
docker/seed/config.rb
```

The configuration seed reproduces Redmine behavior and constraints required by MCP integration tests. It does not copy production data.

## Representative test data

Synthetic representative test data is managed in:

```text
docker/seed/data.rb
```

The seed creates deterministic data for read-only integration and MCP E2E tests:

- Non-admin `mcp-test` user
- `MCP Test Project`
- `MCP Secondary Project`
- Read-only memberships
- `v0.1.0` and `v0.2.0` versions
- Issues covering multiple trackers and statuses
- Low, Normal, and High priorities
- Assigned and unassigned issues
- `release_tag` values and an unset value
- Searchable issue descriptions
- An issue journal
- An issue relation
- Deterministic test-only API token

The data is synthetic and is not copied or anonymized from production Redmine.

Run the data seed independently with:

```bash
npm run redmine:seed:data
```

Apply both configuration and data seeds with:

```bash
npm run redmine:seed
```

## Configuration and test data boundary

Configuration defines Redmine behavior and constraints:

```text
Settings
Trackers
Issue statuses
Roles
Workflow transitions
Workflow permissions
Issue custom fields
Enumerations
```

Test data represents operational objects:

```text
Users
Projects
Versions
Memberships
Issues
Journals
Relations
Custom field values
API tokens
```

`data.rb` depends on the configuration created by `config.rb`. It must not create missing configuration implicitly.

## Deterministic fixtures

Tests must not rely on database IDs.

Use stable fixture keys such as:

```text
Project identifier
Issue subject
User login
Version name
Custom field name
```

Repeated seed execution is intended to converge without creating duplicate projects, versions, issues, journals, relations, or API tokens.

## Test credentials

The disposable local and CI environment uses:

```text
REDMINE_URL=http://localhost:3000
REDMINE_API_KEY=0123456789abcdef0123456789abcdef01234567
```

Never reuse this API token in production.

## Next phase

The next phase formalizes the Redmine client response types and error model before implementing the read-only Issue, Project, and Search MCP tools.

## License

MIT
