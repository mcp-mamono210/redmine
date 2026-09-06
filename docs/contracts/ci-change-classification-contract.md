# CI Change Classification Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the CI change-classification boundary introduced by
CI Execution Optimization.

The purpose is to avoid running runtime-heavy verification when a change cannot
affect runtime behavior, while preventing contract, architecture, CI, runtime,
test, environment, or Context Budget changes from being skipped merely because
they use a documentation-like file extension.

This contract selects verification domains. It does not yet define CircleCI job
names, workflow topology, path-filtering implementation, cache keys, branch
filters, or release triggers. Those integration details belong to later CI
Execution Optimization tickets.

## Safety rule

Classification is fail-safe.

If a changed path is unknown, malformed, empty, or not covered by a committed
rule, the classifier selects the full quality-gate domain set. New repository
areas therefore become expensive by default rather than silently bypassing
verification.

A file is ordinary documentation only when it is explicitly allowlisted. A
`.md` suffix alone never grants a skip.

## Execution context

Classification has three execution contexts:

```text
normal
release_candidate
release
```

`normal` may use change-based verification selection.

`release_candidate` and `release` always require the full quality-gate domain
set regardless of changed paths. The execution context is supplied by the CI
or release workflow and is not inferred from filenames.

## Change classes

The classifier reports one or more of these classes:

| Class | Meaning |
| --- | --- |
| `ordinary_documentation` | Explicitly allowlisted prose/documentation that does not define runtime, public contract, architecture, CI, test, environment, or Context Budget behavior. |
| `contract_architecture_ci` | Canonical contract, ADR, CI policy/tooling, dependency/runtime boundary, or other architecture-affecting change. |
| `runtime_test_environment` | Product source, test source, runtime configuration, dependency/runtime configuration, or Redmine test-environment change. |
| `context_budget` | Change that directly affects the current Context Budget contract, measurement implementation, public MCP response/runtime surface, or deterministic Redmine measurement environment. |
| `ambiguous` | Unknown or invalid path. Full verification is required. |

A change set may contain several classes. Classes are not mutually exclusive.
Verification is the union of all selected domains.

## Verification domains

The classifier selects from these logical verification domains:

```text
static
unit
integration
e2e
context_budget
```

`static` represents repository static verification such as lint, type checking,
and build verification. CI-2 and CI-3 may refine command composition without
changing the classification meaning.

The full quality-gate domain set is:

```text
static
unit
integration
e2e
context_budget
```

Release-oriented reproducibility verification remains a separate release-gate
responsibility and is not inferred from changed paths.

## Version-1 repository rules

### Ordinary documentation

The current explicit ordinary-documentation allowlist is:

```text
README.md
CHANGELOG.md
AGENTS.md
```

A normal change containing only these paths may omit Integration, E2E, and
Context Budget verification.

Adding a future documentation area to this allowlist is a classification
contract change and requires review.

### Canonical contracts and ADRs

The following are always `contract_architecture_ci`:

```text
docs/contracts/**
docs/adr/**
```

They require at least `static` and `unit` verification under normal execution.
They are not ordinary documentation even when every changed file ends in
`.md`.

`docs/context-budget.md` additionally selects `context_budget`.

### CI, dependency, and runtime boundaries

Changes under `.circleci/**` and changes to the committed runtime/dependency
boundary files below select the full quality-gate domain set:

```text
.nvmrc
.env.example
package.json
package-lock.json
tsconfig.json
eslint.config.js
```

This is intentionally conservative because these files can change how every
verification domain is executed or interpreted.

### CI classification tooling

`src/ci/**` is `contract_architecture_ci` and requires `static` plus `unit`.
The classifier can therefore evolve without recursively forcing Integration,
E2E, and Context Budget verification for every policy-only implementation
change.

### Agent Brief runtime

`src/agent-brief/**` currently requires `static` plus `unit`.

If later phases connect Agent Brief generation to Integration, E2E, or a new
Context Budget scenario, this mapping must be updated as part of that contract
change rather than inferred automatically.

### MCP and Redmine runtime

The current public/runtime paths below select the full quality-gate domain set:

```text
src/mcp/**
src/redmine/**
src/config.ts
src/index.ts
src/server.ts
```

They also report `context_budget` because changes can affect public MCP output,
serialization, backend projection, or measured workflow behavior.

### Tests

Normal test-source changes select their directly relevant verification domain
plus `static`:

```text
tests/unit/**         -> static + unit
tests/integration/**  -> static + integration
tests/e2e/**          -> static + e2e
```

The committed Context Budget measurement implementation is stricter:

```text
tests/helpers/context-*
tests/e2e/context-baseline.json
tests/e2e/context-measurement.test.ts
```

These paths select `static`, `unit`, `e2e`, and `context_budget`.

Unrecognized test/helper locations fall through to the fail-safe full gate.

### Redmine test environment

`docker/**` selects `static`, `integration`, `e2e`, and `context_budget`.

The deterministic Redmine seed and lifecycle are shared foundations for those
verification domains, so a Docker/test-environment change is not eligible for a
documentation-only skip.

## Mixed changes

A multi-file change is classified path by path and verification domains are
unioned.

Example:

```text
README.md
+ tests/integration/redmine-client.test.ts
+ tests/e2e/issues.test.ts

=> static + integration + e2e
```

An ordinary-documentation file never reduces verification required by another
changed file.

## Heavy runtime skip meaning

`heavyRuntimeVerificationSkippable` is true only when all of these domains are
absent:

```text
integration
e2e
context_budget
```

It is false for release candidate / release execution even if the changed paths
would otherwise be lightweight.

This flag is advisory classification output. CI-4 owns the final normal-CI and
release-workflow routing.

## Determinism

Given the same ordered or unordered set of changed repository paths and the
same execution context, classification must select the same classes and
verification domains.

Output ordering is canonical:

```text
classes:
  ordinary_documentation
  contract_architecture_ci
  runtime_test_environment
  context_budget
  ambiguous

verification domains:
  static
  unit
  integration
  e2e
  context_budget
```

Path separators are normalized to `/`. A leading `./` is accepted. Absolute,
empty, traversal-like, or otherwise malformed repository paths fail safe.

## Responsibility boundaries

CI-1 owns:

- classification vocabulary;
- current repository path policy;
- verification-domain mapping;
- ambiguous-change fail-safe behavior;
- release-context full-gate override semantics;
- a deterministic testable classification implementation.

CI-1 does not own:

- CircleCI dynamic configuration or path-filtering mechanism;
- job decomposition or parallel execution;
- Redmine test-environment isolation implementation;
- build/reset deduplication;
- reproducibility cadence changes;
- final normal-CI/release workflow wiring.

Those responsibilities remain with CI-2, CI-3, and CI-4.

## Verification contract

`classifyChangedPaths(paths, executionContext)` is a pure classification
boundary. Unit tests must cover at least:

- ordinary documentation only;
- canonical contract / ADR changes;
- Context Budget contract or measurement changes;
- runtime changes;
- Unit / Integration / E2E test changes;
- mixed changes;
- unknown paths;
- malformed/traversal paths;
- empty change sets;
- release candidate and release overrides;
- path-separator normalization.

A classification change that makes an existing full-gate or targeted path
lighter is a contract change and requires explicit review.
