# ADR-016: Separate single-pass normal CI from an explicit reproducibility gate

Status: Accepted
Date: 2026-09-06

## Context

After CI-2 split verification into parallel jobs, the normal pipeline still
repeated Integration, E2E, and Context Budget verification. The E2E and Context
Budget canonical commands also performed prerequisite work internally, so a
repeated pass repeated builds and Redmine resets as well.

Those checks provide useful release confidence, but paying their full repeated
cost on every commit is not necessary to detect ordinary regressions. Removing
them entirely would weaken the deterministic testing contract.

The repository also needs to preserve convenient local commands while allowing
CI jobs to prepare prerequisites once and execute only the verification body.

## Decision

Normal CI executes each required verification domain once.

Move repeated Integration, E2E, and Context Budget verification to a dedicated
reproducibility gate that is explicit and disabled by default in CircleCI.

Keep canonical local commands convenient, and introduce narrow CI primitives:

```text
test:e2e
  -> build + test:e2e:ci

context:measure
  -> redmine:reset + build + context:measure:ci
```

The CI primitives do not build or reset. Their caller owns prerequisites.

The reproducibility gate performs two passes of each stateful verification from
fresh deterministic Redmine resets. It builds TypeScript once and reuses that
fixed build for repeated E2E and Context Budget passes.

Expose the gate through a CircleCI pipeline parameter but do not bind it to a
branch, tag, release candidate, or release event in CI-3. CI-4 owns that final
routing decision.

## Consequences

Normal CI no longer repeats Integration, E2E, or Context Budget work, reducing
machine time and Redmine lifecycle churn.

Local contributor commands remain usable without knowing CI internals.

CI job definitions can make reset/build ownership visible and testable instead
of hiding setup inside repeated commands.

Reproducibility remains available as a first-class gate and can be connected to
release-oriented workflows without restoring repeated work to every commit.

The dedicated reproducibility job is intentionally expensive. Its cost is paid
only when explicitly requested or when a later routing contract requires it.

Build output reproducibility is not asserted by this decision. The repeated
checks hold the commit and build fixed while validating deterministic Redmine
state, MCP behavior, and Context Budget results.
