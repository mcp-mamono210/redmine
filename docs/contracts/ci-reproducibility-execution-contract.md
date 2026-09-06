# CI Reproducibility Execution Contract

Status: v0.3.0 canonical contract
Target release: v0.3.0

## Purpose

This document defines the CI-3 cadence boundary and its CI-4 routing integration.

Normal CI performs stateful verification once. Reproducibility remains a
separate expensive gate.

## Normal CI cadence

Normal stateful cadence remains:

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

CI-4 may omit a normal verification domain only when CI-1 classification does
not select it.

## Canonical local commands and CI primitives

```text
test:e2e
  -> build + test:e2e:ci

context:measure
  -> redmine:reset + build + context:measure:ci
```

The narrow CI primitives do not build or reset. Their caller owns prerequisites.

`context:baseline:update` remains an explicit local operation and is never part
of CI.

## Reproducibility gate

The repository gate remains:

```text
npm run ci:reproducibility
```

It performs two fresh-reset passes of Integration, E2E, and Context Budget while
holding the commit and build fixed.

## Normal manual exposure

For a normal pipeline, reproducibility remains opt-in through:

```text
run_reproducibility = true
```

The setup parameter defaults to `false`.

CI-4 maps this request to a separate `manual_reproducibility` continuation
workflow. It does not make repeated verification part of every normal commit.

## Release integration

For `release_candidate` and `release`, reproducibility is mandatory.

It is included directly in `release_full_quality_gate` and therefore does not
depend on the normal `run_reproducibility` flag.

A final `release_gate` job requires the reproducibility job together with static,
Unit, Integration, E2E, and Context Budget verification.

## Failure behavior

A failed reproducibility pass fails its job immediately.

In release candidate / release context, that failure prevents the final
`release_gate` job from succeeding.

No CI path updates the Context Budget baseline automatically.

## Verification contract

Repository tests must verify:

- normal stateful jobs keep single-pass cadence;
- manual reproducibility defaults off;
- explicit normal reproducibility can still be requested;
- release candidate / release include reproducibility unconditionally;
- final release gate requires reproducibility;
- Context Budget baseline update is absent from all CI configurations.
