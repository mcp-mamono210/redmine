# Redmine MCP Server

A TypeScript MCP server for accessing Redmine through a bounded read interface plus explicitly guarded workflow-specific writes.

The project is designed around predictable MCP contracts, structured output, deterministic testing, and explicit control of context cost.

## Status

Current package version: `0.2.0`

Release preparation target: v0.3.0 release candidate.

The package metadata remains `0.2.0` during Phase 43 release preparation. The
version change to `0.3.0`, Git tag `v0.3.0`, and GitHub Release are Phase 44
release operations and are not performed by the documentation-alignment phase.

The v0.3.0 functional boundary ends at `Ready for Agent`: one human-reviewed,
versioned Agent Brief has passed Handler Validation and has complete approval
metadata suitable for later handoff. v0.3.0 does not claim, provision, execute,
orchestrate, or retry an Agent.

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

`redmine_approve_agent_brief` is not an Agent execution Tool. After Phase 41,
exact repeated approval requests are idempotent by source-of-truth
reconciliation. Ambiguous writes use bounded read-back recovery, and unresolved
state is never reported as approval success.

The Tool Registry is the source of truth for which tools are currently implemented and eligible for publication.

## Agent Brief Workflow

v0.3.0 separates Human Review, Handler Validation, and later Agent execution:

```text
versioned Agent Brief
    |
    v
Brief Draft
    |
    | Human Review completed and Handler Validation requested
    v
Brief Ready
    |
    | Handler Validation validates the exact reviewed artifact
    | against current requirements
    v
Ready for Agent
    |
    +---- v0.3.0 functional boundary ----
    |
    v
future Agent execution layer
```

`Brief Ready` is validation-pending and is not handoff or execution permission.
Only `Ready for Agent` together with complete, consistent approval metadata is
handoff eligible.

The durable handoff identifies the approved artifact using the existing
repository / Redmine Issue / Brief revision / persisted revision boundary and
retains the approved requirements fingerprint, approver identity, and approval
time. A later execution layer must revalidate current requirements before
starting work because requirements may change after approval.

The source-of-truth split remains:

```text
Redmine
  -> requirements, business state, Agent Brief lifecycle, approval metadata

Versioned Brief storage
  -> Agent Brief content, revision history, immutable persisted revision

Future Agent runtime layer
  -> claim, lease, heartbeat, workspace, execution, CI/PR runtime state
```

v0.3.0 does not introduce an automatic Brief Generator service, Redmine
Webhook/polling automation, Agent Controller, Worker orchestration, workspace
provisioning, claim/lease/heartbeat, Agent execution, Agent source push, CI retry
automation, or Pull Request automation.

Canonical contracts are indexed in [`docs/adr/README.md`](docs/adr/README.md).
The release-level `Ready for Agent` boundary is defined in
[`docs/contracts/agent-brief-release-handoff-contract.md`](docs/contracts/agent-brief-release-handoff-contract.md),
and the final public approval Tool surface is defined in
[`docs/contracts/agent-brief-public-mcp-surface-contract.md`](docs/contracts/agent-brief-public-mcp-surface-contract.md).

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
run in parallel because they do not use the shared Redmine environment. CI
places stateful verification in isolated jobs so one job's seed/reset/mutation
does not become another job's state.

`test:e2e` remains the canonical local command and performs its required build.
CI uses the narrower `test:e2e:ci` primitive after the job has explicitly built
and reset its own isolated environment.

## Context Budget

Context cost is treated as a regression-sensitive quality characteristic.
The complete measurement, regression, baseline-update, and CI contract is
documented in [`docs/context-budget.md`](docs/context-budget.md).

Measure the current deterministic scenarios against the committed budgets:

```bash
npm run context:measure
```

This canonical local command resets Redmine, builds the server, then runs both
the retained v0.2.0 read-only baseline comparison and the v0.3.0 Agent Brief
public-surface budget regression. It does not update either budget.

CI uses `context:measure:ci` only after the job has explicitly prepared its own
build and deterministic Redmine state.

When a read-only context-cost change is intentional, explicitly regenerate the
read-only baseline:

```bash
npm run context:baseline:update
```

Review the resulting baseline diff before committing it. The Agent Brief
public-surface budget ceilings are reviewed repository values and are not
automatically rewritten by this command.

CI must not automatically accept or update a changed Context Budget baseline or
Agent Brief public-surface budget.

## CI

CircleCI uses responsibility-based change classification for normal pipelines
and a fixed full quality gate for release candidates and releases.

Normal CI routes the required verification domains from the committed
classification contract. Independent static, Unit, Integration, MCP E2E, and
Context Budget verification run as separate jobs. Stateful jobs use isolated
machine executors and deterministic Redmine reset boundaries.

An ordinary documentation-only change can use the lightweight documentation
route when it does not affect runtime behavior, public contracts, security,
architecture/CI contracts, test architecture, or Context Budget behavior.
Unknown or unclassifiable changes fail safe to the full normal verification set.

Repeated deterministic verification is kept in the explicit reproducibility
gate:

```bash
npm run ci:reproducibility
```

For normal CI, CircleCI exposes this through the opt-in `run_reproducibility`
pipeline parameter, which defaults to `false`.

A release candidate is requested with:

```text
ci_execution_context = release_candidate
```

Release-candidate and release contexts ignore normal changed-file skip decisions
and require the fixed full release gate:

```text
static
unit
integration
e2e
context_budget
reproducibility
```

The final CircleCI `release_gate` depends on all six verification jobs. Context
Budget and reproducibility therefore cannot be skipped for a release candidate
or release. The gate verifies release quality only; it does not mutate package
metadata, create Git tags, create GitHub Releases, or deploy.

The canonical CI routing contract is
[`docs/contracts/ci-release-gate-contract.md`](docs/contracts/ci-release-gate-contract.md).

## Development Notes

Implementation-specific migration notes, temporary compatibility fixes, and debugging records should be tracked in Redmine tickets, commits, tests, or architecture documentation rather than replacing this README.

The README is intended to remain the stable entry point for users and contributors.
