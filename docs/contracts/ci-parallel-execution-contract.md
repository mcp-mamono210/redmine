# CI Parallel Execution Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0

## Purpose

This document defines the CI-2 execution boundary for splitting independent
verification into separate CircleCI jobs while preserving the verification
coverage that existed before the split.

CI-2 changes execution topology and chooses the minimum executor family needed
by each verification domain. It does not change the CI change-classification
policy established by CI-1, remove repeated verification, redefine
reproducibility cadence, or finalize normal-CI/release routing.

## Verification jobs

The normal workflow defines these independent logical jobs:

```text
static
unit
integration
e2e
context_budget
```

They are intentionally listed without workflow `requires` dependencies. CircleCI
may therefore schedule them concurrently when executor capacity is available.

The jobs own these verification domains:

| Job | Responsibility | Executor family |
| --- | --- | --- |
| `static` | ESLint, TypeScript type checking, and build verification | Docker |
| `unit` | Unit tests | Docker |
| `integration` | Redmine-backed Integration tests and the existing Integration reproducibility rerun | Machine |
| `e2e` | MCP E2E tests and the existing E2E reproducibility rerun | Machine |
| `context_budget` | Context Budget regression measurement and the existing reproducibility rerun | Machine |

The `context_budget` job is separated as well so it does not serialize Unit,
Integration, or E2E execution.

## Executor boundary

Executor choice follows runtime requirements rather than using a machine VM for
all jobs.

`static` and `unit` use the CircleCI Docker executor with the repository's
pinned Node.js version:

```text
cimg/node:24.19.0
```

Those jobs do not require Docker Compose, a local Redmine service, mutable
volumes, or host-level lifecycle operations. They verify that the container's
Node.js runtime exactly matches `.nvmrc` and run `npm ci` independently.

`integration`, `e2e`, and `context_budget` continue to use:

```text
ubuntu-2404:current
```

These jobs require the machine executor because the committed Redmine lifecycle
uses Docker Compose against the job-local Docker daemon and localhost namespace.
They install the Node.js version pinned by `.nvmrc` through the machine image's
nvm installation before running verification.

CI-2 intentionally does not introduce dependency caches, workspaces, or shared
build artifacts. Such sharing can be introduced later only when its
reproducibility and isolation effects are explicit.

## Redmine environment isolation

`integration`, `e2e`, and `context_budget` each run in a separate CircleCI
machine job.

A CircleCI machine job owns its own VM and therefore its own Docker daemon,
Docker Compose project state, container network, named volumes, and localhost
port namespace. The jobs do not share a Redmine database or Docker volume.

The existing `npm run redmine:reset` command remains the canonical lifecycle
entry point for stateful tests. It performs the committed reset sequence before
seeding deterministic test data.

Each stateful job also executes `npm run redmine:stop` with `when: always` so
cleanup runs after success or failure.

No shared Redmine service, remote database, shared Docker volume, or cross-job
seed state is introduced by CI-2.

## Deterministic seed boundary

CI-2 preserves the existing deterministic Redmine reset and seed commands.
Parallelization must not replace them with per-job ad hoc fixtures.

For a stateful job:

```text
fresh machine VM
  -> redmine:reset
  -> canonical seed
  -> verification
  -> optional existing reproducibility reset/rerun
  -> redmine:stop
```

A mutation in one job cannot be relied upon by another job.

## Existing verification coverage

CI-2 is deliberately coverage-preserving.

Before CI-3 changes redundancy or cadence, the workflow continues to execute:

- Integration tests twice with a reset before each run;
- E2E tests twice with a reset before each run;
- Context Budget measurement twice using the existing canonical command.

The split changes wall-clock topology and executor selection, not the meaning or
count of these verification checks.

`test:e2e` and `context:measure` still contain their current build/reset behavior.
Removing that duplication belongs to CI-3.

## Failure boundary

A failure in any required job fails that job independently. No job consumes
mutable filesystem or Redmine state produced by another job.

The workflow must not introduce ordering solely to recover the old single-job
execution sequence. If a future verification truly depends on an artifact from
another job, that dependency must be made explicit and must preserve deterministic
reproduction.

## Relation to CI-1

CI-1 defines which verification domains a change requires. CI-2 defines how the
verification domains can execute independently.

CI-2 does not yet wire `classifyChangedPaths` into CircleCI routing. Until CI-4
owns final normal-CI/release routing, the current workflow runs all split jobs.

This separation prevents job topology from duplicating the classification
business rule.

## Relation to CI-3

CI-3 owns:

- redundant build reduction;
- redundant Redmine reset reduction;
- Integration/E2E repeated-execution cadence changes;
- Context Budget repeated-measurement cadence changes;
- local canonical command versus CI primitive command composition.

CI-2 therefore preserves those behaviors exactly enough to avoid weakening the
existing gate during the topology change.

## Relation to CI-4

CI-4 owns:

- normal-CI routing from CI-1 classification results;
- release-candidate full-gate routing;
- release full-gate routing;
- release-oriented reproducibility placement.

CI-2 does not infer release context from branches, tags, or filenames.

## Verification contract

Repository tests for CI-2 must verify at least:

- `static`, `unit`, `integration`, `e2e`, and `context_budget` jobs exist;
- the workflow schedules those jobs without `requires` dependencies;
- `static` and `unit` use the Docker executor with the pinned Node.js image;
- Unit execution is isolated from Redmine lifecycle commands;
- Integration, E2E, and Context Budget use the machine executor;
- Integration and E2E each execute their own Redmine reset and cleanup;
- Redmine credentials are scoped to stateful jobs only;
- existing Integration/E2E/Context Budget repeated verification remains present
  until CI-3 changes its cadence;
- the old monolithic `test` job is removed.
