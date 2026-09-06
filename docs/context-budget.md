# Context Budget

Status: v0.3.0 CI routing contract; v0.2.0 baseline retained
Target release: v0.3.0
Baseline format version: 1

This document defines the committed Context Budget baseline and its normal and
release CI routing boundary. Numeric baseline values and measurement policy
remain inherited from v0.2.0 unless explicitly reviewed and updated.

## Sources of truth

| Responsibility | Source of truth |
| --- | --- |
| Machine-readable baseline | `tests/e2e/context-baseline.json` |
| Measurement scenarios | `tests/e2e/context-measurement.test.ts` |
| Serialization / estimate | `tests/helpers/context-measurement.ts` |
| Regression policy | `tests/helpers/context-comparison.ts` |
| Local / CI commands | `package.json` |
| CI routing | `.circleci/config.yml`, `.circleci/continue_config.yml` |
| Reproducibility cadence | `docs/contracts/ci-reproducibility-execution-contract.md` |
| Release gate | `docs/contracts/ci-release-gate-contract.md` |

## Measurement command boundary

Canonical local verification:

```text
npm run context:measure
```

performs:

```text
redmine:reset
build
context:measure:ci
```

`context:measure:ci` assumes deterministic Redmine state and compiled server
output already exist.

`context:baseline:update` remains local-only and requires human review.

## Regression policy

The committed v0.2.0 baseline, scenario set, byte/character/token estimate
policy, thresholds, secret checks, and baseline update policy remain unchanged
by CI-4.

The gate passes only when:

```text
has_regressions == false
AND
requires_baseline_update == false
```

## Normal CI

CI-1 determines whether a normal change requires `context_budget`.

When selected, CI-4 runs the existing single-pass Context Budget job:

```text
build
redmine:reset
context:measure:ci
```

Ordinary documentation that does not select `context_budget` may skip this job.

Unknown or ambiguous normal changes fail safe to the full normal domain set and
therefore include Context Budget verification.

## Reproducibility

The explicit gate:

```text
npm run ci:reproducibility
```

runs Context Budget twice from fresh deterministic resets.

For normal CI this remains optional unless explicitly requested.

## Release candidate / release

Context Budget is mandatory for both execution contexts and cannot be removed by
normal changed-file classification.

The release workflow contains:

```text
context_budget
reproducibility
```

and the final `release_gate` requires both along with the other full-gate
verification jobs.

A Context Budget regression therefore prevents a successful release gate.

## Baseline safety

No normal, reproducibility, release-candidate, or release CI workflow invokes:

```text
context:baseline:update
```

An intentional baseline change remains an explicit reviewed repository change.
