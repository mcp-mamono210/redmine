# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

The project is progressing toward `v0.1.0`, which expands the initial walking skeleton into a read-only MCP server.

## Configuration seed

Redmine configuration is managed as code in:

```text
docker/seed/config.rb
```

The configuration seed reproduces Redmine behavior and constraints required by MCP integration tests. It does not copy production data.

The current configuration includes:

- REST API enabled
- Default language
- Trackers
  - Bug
  - Feature
  - Task
- Issue statuses
  - New
  - In Progress
  - Resolved
  - Closed
- `MCP Read Only` role
- Deterministic workflow transitions
- `release_tag` issue custom field
- Issue priorities
  - Low
  - Normal
  - High

Run the configuration seed with:

```bash
npm run redmine:seed:config
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
API tokens
```

Projects and issues must not be added to `config.rb`.

## Workflow configuration

The `MCP Read Only` role uses the following deterministic workflow for each seeded tracker:

```text
New
↓
In Progress
↓
Resolved
↓
Closed
```

## Issue custom field

The configuration seed creates:

```text
release_tag
```

It is a string field intended for release identifiers such as:

```text
v0.0.1
v0.1.0
v1.0.0
```

## Issue priorities

The configuration seed ensures:

```text
Low
Normal
High
```

`Normal` is configured as the default priority.

## Next phase

The next phase expands representative test data with projects, versions, issues, journals, relations, and custom-field values.

## License

MIT
