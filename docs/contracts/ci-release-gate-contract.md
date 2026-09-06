# CI Normal / Release Full Quality Gate Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0

## Purpose

This document defines the CI-4 routing boundary between normal change-based CI
and release-oriented full quality gates.

CI-1 defines what verification domains a change requires. CI-2 defines isolated
parallel execution. CI-3 defines single-pass normal cadence and the explicit
reproducibility gate. CI-4 connects those contracts to CircleCI execution.

## Execution contexts

The routing boundary recognizes:

```text
normal
release_candidate
release
```

`normal` uses change classification.

`release_candidate` ignores change-based skip decisions and requires the full
release quality gate.

Any CircleCI tag pipeline is resolved as `release` and also requires the full
release quality gate. This is deliberately fail-safe: a tag pipeline is never
allowed to become lighter because its changed-file set is small or unavailable.

A release candidate is requested explicitly with the setup pipeline parameter:

```text
ci_execution_context = release_candidate
```

No repository-wide release-candidate branch naming convention existed when
CI-4 was implemented, so CI-4 does not invent one.

## Normal CI routing

The setup workflow obtains the changed repository paths and calls the committed
CI-1 classification boundary.

The selected verification domains map directly to continuation parameters:

```text
static         -> static workflow
unit           -> unit workflow
integration    -> integration workflow
e2e            -> e2e workflow
context_budget -> context_budget workflow
```

An ordinary-documentation-only change that selects no verification domain runs
a lightweight `docs_only` marker job instead of runtime-heavy verification.

Unknown, malformed, empty, or unclassifiable change input is handled by the
CI-1 fail-safe rule and selects the full normal domain set.

The routing layer must not maintain a second independent path-classification
table.

## Dynamic configuration boundary

`.circleci/config.yml` is the setup configuration.

The setup job:

1. checks out the requested revision;
2. installs the pinned Node.js dependencies;
3. builds the committed TypeScript CI classifier/routing implementation;
4. resolves changed paths and execution context;
5. writes continuation parameters;
6. continues into `.circleci/continue_config.yml`.

The continuation configuration owns verification jobs and conditional
workflows.

CircleCI dynamic configuration must be enabled for the project before this
setup configuration can run.

## Release full quality gate

Both `release_candidate` and `release` run this fixed domain set regardless of
changed paths:

```text
static
unit
integration
e2e
context_budget
reproducibility
```

The release workflow includes a final `release_gate` job that requires all six
verification jobs.

Therefore `release_gate` cannot succeed when any required verification fails.

`release_gate` is a quality-gate marker only. CI-4 does not create a Git tag,
GitHub Release, publish package metadata, deploy, or perform another release
operation.

Any release operation that is later automated must require successful
`release_gate` completion rather than bypassing it.

## Reproducibility

Normal CI does not run reproducibility by default.

The existing manual opt-in remains available:

```text
run_reproducibility = true
```

For release candidate / release contexts, reproducibility is not optional. It is
part of `release_full_quality_gate` and does not depend on the normal
`run_reproducibility` parameter.

## Context Budget

`context_budget` remains part of the release full quality gate.

Neither normal routing nor release routing may execute
`context:baseline:update`.

A release candidate or release cannot pass the final release gate if Context
Budget verification fails.

## Failure behavior

The following conditions fail safe:

- changed-path resolution fails during normal routing;
- changed paths are empty or unknown;
- a path is outside committed CI-1 classification rules;
- a tag pipeline is triggered;
- release candidate context is explicitly requested.

The first three select all normal verification domains through CI-1.
The latter two select the release full quality gate including reproducibility.

## Phase 42 / 43 / 44 boundary

Phase 42 can rely on CI routing without weakening Security, Integration / E2E,
or Context Budget verification.

Phase 43 uses the `release_candidate` context to run the full gate plus
reproducibility before release preparation is considered complete.

Phase 44 release execution must consume a successful release full-quality-gate
result. CI-4 does not perform the release itself.

## Verification contract

Repository tests must verify at least:

- normal ordinary documentation selects no runtime-heavy domain;
- normal contract / runtime / test changes select CI-1 domains unchanged;
- ambiguous normal changes fail safe;
- `release_candidate` always selects the release full gate;
- a tag pipeline always selects the release full gate;
- the release full gate contains static, Unit, Integration, E2E, Context Budget,
  and reproducibility;
- final `release_gate` requires every release verification job;
- manual reproducibility remains disabled by default;
- release reproducibility cannot be disabled by a normal skip rule;
- Context Budget baseline update is absent from CI execution.
