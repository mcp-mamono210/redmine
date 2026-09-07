# Redmine MCP Server

A TypeScript MCP server for accessing Redmine through a bounded read interface plus explicitly guarded workflow-specific writes.

The project is designed around predictable MCP contracts, structured output, deterministic testing, and explicit control of context cost.

## Status

Current package version: `0.2.0`

Release status: v0.2.0 release candidate. Git tagging, GitHub Release creation,
and the final release operation remain outside this preparation change.

The published MCP Tool Registry is read-only by default. When write publication
is explicitly enabled and the Agent Brief approval storage configuration is
provided, the registry additionally exposes the narrow
`redmine_approve_agent_brief` workflow Tool. Generic Redmine mutation Tools are
not exposed.

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

The server reads its Redmine connection and guarded-write settings from environment variables.

| Variable | Required | Description |
| --- | --- | --- |
| `REDMINE_URL` | Yes | Base URL of the Redmine instance |
| `REDMINE_API_KEY` | Yes | Redmine API key used by the MCP server |
| `REDMINE_TIMEOUT_MS` | No | Positive integer request timeout in milliseconds; defaults to 10000 |
| `REDMINE_WRITE_ENABLED` | No | Write Tool publication guard. Accepts only `true` or `false`; defaults to `false` |
| `REDMINE_ALLOWED_PROJECTS` | No | Comma-separated project allowlist used by the write guard |
| `AGENT_BRIEF_REPOSITORY_ROOT` | When write Tools are enabled | Absolute or process-resolvable path to the local Git work tree that stores Phase 37 Agent Brief revisions |
| `AGENT_BRIEF_REPOSITORY` | When write Tools are enabled | Canonical repository identity expected in persisted Agent Brief metadata |
| `AGENT_BRIEF_CANONICAL_BRANCH` | No | Canonical Agent Brief storage branch; defaults to `main` |
| `AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS` | No | Comma-separated positive Redmine custom-field IDs that are requirement-bearing for Agent Brief fingerprint projection |

Example for read-only operation:

```bash
export REDMINE_URL="https://redmine.example.com"
export REDMINE_API_KEY="<redmine-api-key>"
npm start
```

Example for the guarded Agent Brief approval Tool:

```bash
export REDMINE_URL="https://redmine.example.com"
export REDMINE_API_KEY="<redmine-api-key>"
export REDMINE_WRITE_ENABLED="true"
export REDMINE_ALLOWED_PROJECTS="<project-identifier>"
export AGENT_BRIEF_REPOSITORY_ROOT="/srv/repos/redmine"
export AGENT_BRIEF_REPOSITORY="mcp-mamono210/redmine"
export AGENT_BRIEF_CANONICAL_BRANCH="main"
npm start
```

Do not commit production credentials to the repository.

## MCP Tools

The Tool Registry publishes these read tools in the default configuration:

| Tool | Purpose |
| --- | --- |
| `redmine_get_current_user` | Get the Redmine user associated with the configured API key |
| `redmine_get_issue` | Get issue detail with explicitly requested optional associations |
| `redmine_list_issues` | List bounded issue summaries |
| `redmine_search` | Search Redmine with bounded results |
| `redmine_get_project` | Get project detail and aggregated project metadata |
| `redmine_list_projects` | List bounded project summaries |

When `REDMINE_WRITE_ENABLED=true`, the write publication guard additionally
allows the following registered workflow Tool to be published:

| Tool | Purpose |
| --- | --- |
| `redmine_approve_agent_brief` | Explicitly validate one human-reviewed persisted Agent Brief and, when CURRENT, record approval metadata and transition `Brief Ready` to `Ready for Agent`; STALE returns the Brief to `Brief Draft` |

`redmine_approve_agent_brief` is not an Agent execution Tool and is not
idempotent in the v0.3.0 Phase 40 contract. Duplicate-call and interrupted-write
recovery semantics belong to Phase 41.

The Tool Registry is the source of truth for which tools are currently implemented and eligible for publication.

## Response Design

The MCP interface is intentionally designed to limit unnecessary context consumption.

The main principles are:

- list operations return summaries rather than full resource detail;
- list and search operations use bounded pagination;
- optional issue associations are returned only when explicitly requested;
- MCP responses provide structured output;
- project metadata aggregation is bounded and supports partial-result warnings where appropriate;
- the Agent Brief approval Tool returns only bounded workflow outcomes and stable identifiers rather than Issue or Brief bodies.

This keeps common discovery and approval workflows smaller than returning complete Redmine API payloads for every request.

## Write Guard

Write Tool publication is controlled by `REDMINE_WRITE_ENABLED`.

When the variable is omitted or set to:

```text
false
```

write entries are excluded from the published Tool Registry.

`REDMINE_ALLOWED_PROJECTS` provides a comma-separated project allowlist for write operations. An empty or unset allowlist allows no project mutation.

When write publication is enabled, `redmine_approve_agent_brief` remains subject
to the same project allowlist before any lifecycle or approval metadata write.
The approval path reuses the existing Agent Brief lifecycle metadata boundary;
it does not expose a generic custom-field writer or generic lifecycle mutation
Tool.

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
```

The integration suite contains write-boundary tests and can mutate Redmine state. Reset Redmine before running the E2E suite so that E2E assertions start from the canonical fixture.

Redmine-dependent integration and E2E test files run serially. Unit tests may
run in parallel because they do not use the shared Redmine environment. This
keeps the shared fixture deterministic without introducing per-test cleanup or
granting additional Redmine permissions.

`test:e2e` remains the canonical local command and performs its required build.
CI uses the narrower `test:e2e:ci` primitive after the job has explicitly built
and reset its own isolated environment.

## Context Budget

Context cost is treated as a regression-sensitive quality characteristic.
The complete measurement, regression, baseline-update, and CI contract is
documented in [`docs/context-budget.md`](docs/context-budget.md).

Measure the current deterministic scenarios against the committed baseline:

```bash
npm run context:measure
```

This canonical local command resets Redmine, builds the server, measures the
context scenarios, and compares them with the committed baseline. It does not
update the baseline.

CI uses `context:measure:ci` only after the job has explicitly prepared its own
build and deterministic Redmine state.

When a context-cost change is intentional, explicitly regenerate the baseline:

```bash
npm run context:baseline:update
```

Review the resulting baseline diff before committing it.

CI must not automatically accept or update a changed Context Budget baseline.

## CI

CircleCI separates static, Unit, Integration, MCP E2E, and Context Budget
verification into independent jobs.

Normal CI executes each required verification domain once. The stateful jobs
use isolated machine executors and reset their own Redmine environment before
their verification pass.

The normal CI pipeline covers:

- ESLint
- TypeScript type checking
- build verification
- Unit tests
- Integration tests
- MCP end-to-end tests
- Context Budget regression measurement

Repeated deterministic verification is not deleted. It is moved to the explicit
reproducibility gate:

```bash
npm run ci:reproducibility
```

That gate repeats Integration, E2E, and Context Budget verification twice from
fresh deterministic Redmine resets. CircleCI exposes it through the opt-in
`run_reproducibility` pipeline parameter, which defaults to `false`.

The later release-routing contract decides when release-candidate and release
pipelines automatically require this explicit gate.

## Development Notes

Implementation-specific migration notes, temporary compatibility fixes, and debugging records should be tracked in Redmine tickets, commits, tests, or architecture documentation rather than replacing this README.

The README is intended to remain the stable entry point for users and contributors.
