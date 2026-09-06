# ADR-014: Classify CI changes by repository responsibility with a fail-safe full gate

Status: Accepted  
Date: 2026-09-06

## Context

The v0.3.0 implementation is increasing CI execution time. The current pipeline
runs all verification serially, including runtime-heavy Integration, E2E, and
Context Budget work even for changes that cannot affect runtime behavior.

A simple rule such as "skip CI when only `*.md` files changed" is unsafe in this
repository. Canonical contracts, ADRs, the Context Budget contract, and CI
architecture are themselves versioned documentation and can change the rules
that later implementation and release verification must satisfy.

At the same time, ordinary prose changes should not require Redmine startup,
seed/reset, Integration, E2E, or Context Budget measurement merely because the
repository has no lighter classification boundary.

## Decision

Adopt a deterministic repository-responsibility classifier before changing the
CircleCI workflow topology.

The classifier:

- uses explicit repository path rules rather than filename extension alone;
- treats ordinary documentation as an allowlist;
- distinguishes contract/architecture/CI, runtime/test/environment, and Context
  Budget impact;
- unions verification requirements for multi-file changes;
- sends unknown, invalid, empty, or newly introduced unclassified paths to the
  full quality gate;
- treats release candidate and release execution as full-gate contexts that
  cannot be reduced by normal path classification;
- remains a pure, testable policy boundary independent of CircleCI routing.

The canonical rules are defined by
`docs/contracts/ci-change-classification-contract.md`.

## Consequences

Normal documentation-only changes can later bypass runtime-heavy verification
without weakening the default safety posture.

Canonical `.md` files do not become lightweight merely because of their file
extension.

New repository areas are intentionally expensive until classification policy is
updated. This creates an explicit review point instead of an accidental skip.

CI-2, CI-3, and CI-4 can change job topology, remove redundant work, and wire
normal/release workflows without duplicating the classification business rule.

Changing the path policy can alter which verification runs for a commit and is
therefore treated as a CI contract change, not an incidental script edit.
