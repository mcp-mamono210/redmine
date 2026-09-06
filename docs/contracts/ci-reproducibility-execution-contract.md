# CI Reproducibility Execution Contract

Status: v0.3.0 canonical contract
Target release: v0.3.0

## Purpose

This document defines the CI-3 boundary for removing redundant build, Redmine
reset, and repeated verification from the normal CI path while preserving the
reproducibility requirement as an explicit gate.

CI-3 changes command composition and verification cadence. It does not change
CI-1 change classification, CI-2 job isolation, or CI-4 normal/release routing.

## Normal CI cadence

The normal CI workflow executes each verification domain once per pipeline:

```text
static
unit
integration
 e2e
context_budget
```

Stateful jobs prepare only the state they need for that one verification pass.
They do not repeat a suite solely to prove reproducibility on every normal
commit.

Normal stateful cadence is:

```text
integration:
  redmine:reset
  test:integration

e2e:
  build
  redmine:reset
  test:e2e:ci

context_budget:
  build
  redmine:reset
  context:measure:ci
```

The separate jobs remain isolated according to
`docs/contracts/ci-parallel-execution-contract.md`.

## Canonical local commands and CI primitives

Local contributor commands remain convenient and self-contained where they
were already expected to prepare their own prerequisites.

### E2E

Canonical local command:

```text
npm run test:e2e
```

It performs one build and then invokes the CI primitive:

```text
npm run test:e2e:ci
```

`test:e2e:ci` runs only the E2E suite. It does not build or reset Redmine. A CI
job using the primitive owns those prerequisites explicitly.

### Context Budget

Canonical local command:

```text
npm run context:measure
```

It performs:

```text
redmine:reset
build
context:measure:ci
```

The CI primitive:

```text
npm run context:measure:ci
```

runs only the committed Context Budget comparison. It does not reset Redmine,
build the server, or update the baseline.

`context:baseline:update` remains an explicit local baseline-update operation
and is never part of normal or reproducibility CI.

### Integration

`test:integration` remains the direct Integration test command. Redmine state is
prepared explicitly by the caller because Integration tests intentionally share
the deterministic Redmine environment contract with other stateful suites.

## Build responsibility

A build is performed only where the current executor needs compiled output.

- `static` builds once as static verification.
- `e2e` builds once in its own isolated machine job.
- `context_budget` builds once in its own isolated machine job.
- the explicit reproducibility gate builds once and reuses that immutable build
  for its E2E and Context Budget passes.

Builds that occur in different isolated CircleCI jobs are not considered
redundant because the jobs do not share a workspace or mutable filesystem.
CI-3 does not introduce cross-job artifact sharing.

## Redmine reset responsibility

A normal stateful job executes exactly one `redmine:reset` before its stateful
verification.

The reset is not duplicated inside `test:e2e:ci` or `context:measure:ci`.

The reproducibility gate intentionally executes a fresh reset before every pass
because the requirement being tested is that the same commit against the same
deterministic seed produces the same successful verification outcome without
depending on state left by the previous pass.

## Reproducibility requirement

Reproducibility remains a release-quality requirement. It is moved out of the
normal CI cadence, not deleted.

The repository provides the explicit gate:

```text
npm run ci:reproducibility
```

The gate executes:

```text
Integration pass 1 from fresh reset
Integration pass 2 from fresh reset
E2E pass 1 from fresh reset
E2E pass 2 from fresh reset
Context Budget pass 1 from fresh reset
Context Budget pass 2 from fresh reset
```

The gate builds TypeScript once before the repeated E2E and Context Budget
passes. Reproducibility here verifies deterministic Redmine state, MCP behavior,
and Context Budget output for a fixed commit and fixed build. It does not define
a compiler-output reproducibility requirement.

A cleanup trap stops the Redmine environment on success or failure.

## CircleCI exposure

CircleCI defines a `reproducibility` machine job that invokes the canonical
reproducibility gate.

The workflow is opt-in through the pipeline parameter:

```text
run_reproducibility = true
```

The parameter defaults to `false`, so the normal commit workflow does not pay
the repeated-verification cost.

CI-4 owns connecting this explicit gate to release-candidate and release
contexts. CI-3 does not infer release context from branches, tags, or filenames.

## Context Budget boundary

Normal CI still performs one Context Budget regression measurement whenever the
`context_budget` job runs. A regression, missing scenario, new scenario, invalid
baseline, invalid measurement, or secret disclosure still fails that job.

The reproducibility gate performs two additional measurements only when that
gate is explicitly requested. Both runs use fresh deterministic Redmine state
and the same committed baseline.

No CI path updates the Context Budget baseline automatically.

## Failure behavior

Any failed normal verification fails its job.

Any failed pass in `ci:reproducibility` fails the reproducibility gate
immediately. A later successful retry does not rewrite or hide the failed run.

Unknown routing or release-trigger behavior is outside CI-3 and remains the
responsibility of CI-4.

## Verification contract

Repository tests for CI-3 must verify at least:

- normal Integration executes one reset and one Integration pass;
- normal E2E executes one build, one reset, and one `test:e2e:ci` pass;
- normal Context Budget executes one build, one reset, and one
  `context:measure:ci` pass;
- canonical local `test:e2e` retains its build prerequisite;
- canonical local `context:measure` retains reset and build prerequisites;
- CI primitives do not repeat build or reset internally;
- the reproducibility gate repeats Integration, E2E, and Context Budget twice;
- every reproducibility pass starts from a fresh Redmine reset;
- the reproducibility gate builds once rather than once per repeated pass;
- the CircleCI reproducibility workflow is explicit and disabled by default;
- Context Budget baseline update is not part of CI execution.
