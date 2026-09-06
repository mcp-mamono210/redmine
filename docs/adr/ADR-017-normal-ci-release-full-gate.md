# ADR-017: Route normal CI by classification and require a fixed release full gate

Status: Accepted  
Date: 2026-09-06

## Context

CI-1 established deterministic change classification, CI-2 separated
verification jobs, and CI-3 removed repeated verification from normal CI while
keeping reproducibility as an explicit gate.

The remaining problem is routing. Running every split job on every commit does
not realize the change-classification benefit, while applying the same skip
rules to release candidates or releases could omit required release-quality
evidence.

The repository has a `main` default branch and v0.3.0 requires a `v0.3.0`
release tag, but no committed release-candidate branch naming convention exists.

## Decision

Use CircleCI dynamic configuration.

The setup configuration computes changed paths, reuses the committed CI-1
classifier, resolves execution context, and continues into a verification
configuration using boolean routing parameters.

Normal pipelines run only the verification domains returned by CI-1.
Ordinary-documentation-only changes run a lightweight marker workflow.

Release candidates are requested explicitly with
`ci_execution_context=release_candidate`.

Any tag pipeline is treated as release-oriented and receives the full release
quality gate. This avoids depending on a filename delta or inventing an
unconfirmed tag subset at the routing boundary.

The release full gate always includes:

```text
static
unit
integration
e2e
context_budget
reproducibility
```

A final `release_gate` job requires all of them. CI-4 does not perform the
release operation itself.

## Consequences

Normal CI can realize the cost reduction defined by CI-1 without duplicating
path policy inside CircleCI YAML.

Release candidate and tag pipelines are intentionally more expensive and cannot
use the normal skip rule.

CircleCI dynamic configuration must be enabled in project settings.

A future automated release operation must depend on the successful
`release_gate` marker. Adding that operation is outside this ADR.

If the project later standardizes release-candidate branches or tags, that
trigger convention may be added as an explicit routing-contract change rather
than inferred informally.
