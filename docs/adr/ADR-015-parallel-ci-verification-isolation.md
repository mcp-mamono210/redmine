# ADR-015: Split CI verification by runtime need and isolate stateful jobs

Status: Accepted  
Date: 2026-09-06

## Context

The repository's CircleCI workflow historically runs static verification, Unit,
Integration, E2E, Context Budget measurement, and reproducibility reruns in one
machine job. This preserves a simple sequential lifecycle but makes total
wall-clock time the sum of all verification domains.

CI-1 established a deterministic classification boundary before workflow
routing changes. The next optimization must reduce wall-clock serialization
without changing verification coverage or allowing Redmine-backed tests to
share mutable state.

Integration, E2E, and Context Budget verification all use the local Redmine
Docker environment. Running them concurrently inside the same VM would risk
container, port, volume, seed, and mutation conflicts.

Static verification and Unit tests do not require Docker Compose or a Redmine
environment. Keeping those jobs on machine executors would consume VM capacity
without providing an isolation benefit.

## Decision

Split the existing workflow into five independent CircleCI jobs:

```text
static
unit
integration
e2e
context_budget
```

Do not add workflow `requires` dependencies between these jobs. CircleCI may
schedule them concurrently.

Use executor families according to runtime need:

```text
static          -> Docker executor
unit            -> Docker executor
integration     -> Machine executor
e2e             -> Machine executor
context_budget  -> Machine executor
```

The stateless Docker jobs use `cimg/node:24.19.0`, matching the Node.js runtime
pinned by `.nvmrc`.

The stateful jobs keep the existing `ubuntu-2404:current` machine executor. Each
therefore gets its own VM, Docker daemon, localhost namespace, containers, and
volumes.

Preserve the existing deterministic `redmine:reset` lifecycle and always-run
`redmine:stop` cleanup inside each stateful job.

Do not introduce shared dependency caches, workspaces, build artifacts, or a
shared Redmine service in CI-2. Do not remove repeated Integration, E2E, or
Context Budget verification yet; CI-3 owns redundancy and cadence changes.

The exact execution contract is defined by
`docs/contracts/ci-parallel-execution-contract.md`.

## Consequences

Unit, Integration, E2E, Context Budget, and static verification no longer wait
for an unrelated verification domain merely because they used to share one
job.

Static and Unit verification avoid unnecessary machine executors. Stateful jobs
continue to pay the machine-executor cost only where the local Docker Compose
Redmine environment requires it.

Each job still installs dependencies independently. This trades repeated setup
work for lower wall-clock serialization and simpler isolation until later CI
optimization explicitly introduces safe sharing.

Redmine mutations cannot leak between Integration, E2E, and Context Budget jobs
through Docker state because they run on separate machines.

CI-3 can optimize repeated build/reset/test work later without being coupled to
the job-topology migration. CI-4 can wire CI-1 classification into normal and
release routing without duplicating the isolation design.
