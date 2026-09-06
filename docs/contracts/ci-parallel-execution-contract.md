# CI Parallel Execution Contract

Status: v0.3.0 canonical contract
Target release: v0.3.0

## Purpose

This document defines the CI-2 execution boundary for splitting independent
verification into separate CircleCI jobs while preserving verification coverage
and state isolation.

CI-2 changes execution topology and chooses the minimum executor family needed
by each verification domain. CI-3 subsequently defines build/reset ownership
and reproducibility cadence in
`docs/contracts/ci-reproducibility-execution-contract.md`.

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
| `integration` | One normal Redmine-backed Integration verification pass | Machine |
| `e2e` | One normal MCP E2E verification pass | Machine |
| `context_budget` | One normal Context Budget regression measurement | Machine |

The explicit reproducibility gate is separate from these normal jobs.

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

CI does not introduce dependency caches, workspaces, or shared build artifacts
between these isolated jobs. Such sharing requires a separate explicit contract.

## Redmine environment isolation

`integration`, `e2e`, and `context_budget` each run in a separate CircleCI
machine job.

A CircleCI machine job owns its own VM and therefore its own Docker daemon,
Docker Compose project state, container network, named volumes, and localhost
port namespace. The jobs do not share a Redmine database or Docker volume.

`npm run redmine:reset` remains the canonical lifecycle entry point for stateful
tests. Each normal stateful job executes one reset before its one verification
pass.

Each stateful normal job executes `npm run redmine:stop` with `when: always` so
cleanup runs after success or failure.

No shared Redmine service, remote database, shared Docker volume, or cross-job
seed state is introduced.

## Deterministic seed boundary

Parallelization preserves the deterministic Redmine reset and seed commands.

For a normal stateful job:

```text
fresh machine VM
  -> required build if the suite consumes dist output
  -> redmine:reset
  -> canonical seed
  -> one verification pass
  -> redmine:stop
```

A mutation in one job cannot be relied upon by another job.

Repeated verification from fresh resets is no longer part of the normal job
cadence. CI-3 preserves that requirement in the explicit reproducibility gate.

## Normal verification coverage

The normal workflow continues to cover:

- static verification;
- Unit tests;
- Integration tests;
- MCP E2E tests;
- Context Budget regression measurement.

CI-3 changes repeated-execution cadence but does not remove any of these normal
verification domains.

## Failure boundary

A failure in any required job fails that job independently. No job consumes
mutable filesystem or Redmine state produced by another job.

The workflow must not introduce ordering solely to recover the old single-job
execution sequence. If a future verification truly depends on an artifact from
another job, that dependency must be explicit and deterministic.

## Relation to CI-1

CI-1 defines which verification domains a change requires. CI-2 defines how the
verification domains can execute independently.

CI-2 does not wire `classifyChangedPaths` into CircleCI routing. CI-4 owns final
normal-CI/release routing.

## Relation to CI-3

CI-3 defines:

- redundant build reduction within each executor;
- explicit Redmine reset ownership;
- single-pass normal Integration/E2E/Context Budget cadence;
- the dedicated repeated reproducibility gate;
- local canonical commands versus CI primitive command composition.

The exact current rules are canonical in
`docs/contracts/ci-reproducibility-execution-contract.md`.

## Relation to CI-4

CI-4 owns:

- normal-CI routing from CI-1 classification results;
- release-candidate full-gate routing;
- release full-gate routing;
- automatic release-oriented reproducibility placement.

CI-2 and CI-3 do not infer release context from branches, tags, or filenames.

## Verification contract

Repository tests must verify at least:

- `static`, `unit`, `integration`, `e2e`, and `context_budget` jobs exist;
- the normal workflow schedules those jobs without `requires` dependencies;
- `static` and `unit` use the Docker executor with the pinned Node.js image;
- Unit execution is isolated from Redmine lifecycle commands;
- Integration, E2E, and Context Budget use the machine executor;
- each normal stateful job has its own reset and cleanup boundary;
- Redmine credentials are scoped to stateful jobs only;
- the old monolithic `test` job is absent.
