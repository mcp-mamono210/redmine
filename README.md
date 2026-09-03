# Redmine MCP Server

A TypeScript MCP server for accessing Redmine through a bounded, read-oriented interface.

The project is designed around predictable MCP contracts, structured output, deterministic testing, and explicit control of context cost.

## Status

Current package version: `0.1.1`

The currently published MCP Tool Registry is read-only. Write access infrastructure and guards are being developed separately and are not exposed as write tools by the current registry.

## Requirements

- Node.js `24.19.0`
- npm
- Docker with Docker Compose support for the local Redmine test environment
- A Redmine instance with the REST API enabled for normal server use

The Node.js version is pinned by `.nvmrc` and `package.json`.

## Installation

Install dependencies and build the server:

```bash
npm ci
npm run build
```

Start the stdio MCP server:

```bash
npm start
```

## Configuration

The server reads its Redmine connection settings from environment variables.

| Variable | Required | Description |
| --- | --- | --- |
| `REDMINE_URL` | Yes | Base URL of the Redmine instance |
| `REDMINE_API_KEY` | Yes | Redmine API key used by the MCP server |
| `REDMINE_TIMEOUT_MS` | No | Positive integer request timeout in milliseconds; defaults to 10000 |
| `REDMINE_WRITE_ENABLED` | No | Write Tool publication guard. Accepts only `true` or `false`; defaults to `false` |
| `REDMINE_ALLOWED_PROJECTS` | No | Comma-separated project allowlist used by the write guard |

Example:

```bash
export REDMINE_URL="https://redmine.example.com"
export REDMINE_API_KEY="<redmine-api-key>"
npm start
```

Do not commit production credentials to the repository.

## MCP Tools

The current Tool Registry publishes the following read-only tools:

| Tool | Purpose |
| --- | --- |
| `redmine_get_current_user` | Get the Redmine user associated with the configured API key |
| `redmine_get_issue` | Get issue detail with explicitly requested optional associations |
| `redmine_list_issues` | List bounded issue summaries |
| `redmine_search` | Search Redmine with bounded results |
| `redmine_get_project` | Get project detail and aggregated project metadata |
| `redmine_list_projects` | List bounded project summaries |

The Tool Registry is the source of truth for which tools are currently published.

## Response Design

The MCP interface is intentionally designed to limit unnecessary context consumption.

The main principles are:

- list operations return summaries rather than full resource detail;
- list and search operations use bounded pagination;
- optional issue associations are returned only when explicitly requested;
- MCP responses provide structured output;
- project metadata aggregation is bounded and supports partial-result warnings where appropriate.

This keeps common discovery workflows smaller than returning complete Redmine API payloads for every request.

## Write Guard

Write Tool publication is controlled by `REDMINE_WRITE_ENABLED`.

When the variable is omitted or set to:

```text
false
```

write entries are excluded from the published Tool Registry.

`REDMINE_ALLOWED_PROJECTS` provides a comma-separated project allowlist for write operations.

The current registry contains read-only tools only, so enabling the write guard does not by itself add write tools that are not implemented and registered.

## Local Redmine Test Environment

The repository includes a Docker-based Redmine environment for deterministic integration and MCP E2E testing.

Start Redmine:

```bash
npm run redmine:start
```

Seed the running environment:

```bash
npm run redmine:seed
```

Rebuild the environment from the deterministic seed:

```bash
npm run redmine:reset
```

Stop the environment:

```bash
npm run redmine:stop
```

`redmine:reset` is important between test suites that mutate Redmine state and suites that expect the canonical deterministic fixture.

## Testing

Static and unit checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Integration and E2E tests require the local Redmine test environment and test credentials expected by the deterministic seed.

A typical full local sequence is:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit

npm run redmine:reset
npm run test:integration

npm run redmine:reset
npm run test:e2e

npm run context:measure
npm run build
```

The integration suite contains write-boundary tests and can mutate Redmine state. Reset Redmine before running the E2E suite so that E2E assertions start from the canonical fixture.

Redmine-dependent integration and E2E test files run serially. Unit tests may
run in parallel because they do not use the shared Redmine environment. This
keeps the shared fixture deterministic without introducing per-test cleanup or
granting additional Redmine permissions.

## Context Budget

Context cost is treated as a regression-sensitive quality characteristic.

Measure the current deterministic scenarios against the committed baseline:

```bash
npm run context:measure
```

This command resets Redmine, builds the server, measures the context scenarios, and compares them with the committed baseline.

It does not update the baseline.

When a context-cost change is intentional, explicitly regenerate the baseline:

```bash
npm run context:baseline:update
```

Review the resulting baseline diff before committing it.

CI must not automatically accept or update a changed Context Budget baseline.

## CI

CircleCI validates the project using the same canonical npm commands used locally.

The CI pipeline covers:

- ESLint
- TypeScript type checking
- build
- unit tests
- integration tests
- MCP end-to-end tests
- Context Budget regression measurement

Redmine is reset at test-suite boundaries where deterministic state is required.
CI also repeats the Context Budget measurement and re-runs the integration and
MCP E2E suites after fresh resets. These checks verify that results do not
depend on state left by a previous suite or on a one-time successful seed.

## Development Notes

Implementation-specific migration notes, temporary compatibility fixes, and debugging records should be tracked in Redmine tickets, commits, tests, or architecture documentation rather than replacing this README.

The README is intended to remain the stable entry point for users and contributors.
