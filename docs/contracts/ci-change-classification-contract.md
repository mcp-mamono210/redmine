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

CI-4 consumes this contract through `classifyChangedPaths()` and maps the
selected logical domains to CircleCI continuation workflows. The classification
rules remain independent from CircleCI YAML.

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
set regardless of changed paths.

CI-4 resolves tag pipelines as `release` and accepts explicit
`release_candidate` input. Filenames never define release context.

## Change classes

The classifier reports one or more of these classes:

| Class | Meaning |
| --- | --- |
| `ordinary_documentation` | Explicitly allowlisted prose/documentation that does not define runtime, public contract, architecture, CI, test, environment, or Context Budget behavior. |
| `contract_architecture_ci` | Canonical contract, ADR, CI policy/tooling, dependency/runtime boundary, or other architecture-affecting change. |
| `runtime_test_environment` | Product source, test source, runtime configuration, dependency/runtime configuration, or Redmine test-environment change. |
| `context_budget` | Change that directly affects the current Context Budget contract, measurement implementation, public MCP response/runtime surface, or deterministic Redmine measurement environment. |
| `ambiguous` | Unknown or invalid path. Full verification is required. |

A change set may contain several classes. Verification is the union of all
selected domains.

## Verification domains

The classifier selects from:

```text
static
unit
integration
e2e
context_budget
```

The full domain set is the same five domains.

Release-oriented reproducibility is intentionally separate from changed-path
classification. CI-4 adds it unconditionally for release candidate / release.

## Version-1 repository rules

### Ordinary documentation

```text
README.md
CHANGELOG.md
AGENTS.md
```

Only these explicitly allowlisted files can produce an empty normal verification
domain set.

### Canonical contracts and ADRs

```text
docs/contracts/**
docs/adr/**
```

These require `static` plus `unit`.

`docs/context-budget.md` additionally selects `context_budget`.

### CI, dependency, and runtime boundaries

Changes under `.circleci/**` and these files select the full domain set:

```text
.nvmrc
.env.example
package.json
package-lock.json
tsconfig.json
eslint.config.js
```

### CI classification tooling

`src/ci/**` requires `static` plus `unit`.

### Agent Brief runtime

`src/agent-brief/**` currently requires `static` plus `unit`.

### MCP and Redmine runtime

```text
src/mcp/**
src/redmine/**
src/config.ts
src/index.ts
src/server.ts
```

These select the full domain set and report Context Budget impact.

### Tests

```text
tests/unit/**         -> static + unit
tests/integration/**  -> static + integration
tests/e2e/**          -> static + e2e
```

Context Budget measurement paths select `static`, `unit`, `e2e`, and
`context_budget`.

### Redmine test environment

`docker/**` selects `static`, `integration`, `e2e`, and `context_budget`.

## Mixed changes

Verification domains are the deterministic union of each path classification.
An ordinary-documentation path never reduces another path's requirements.

## Routing integration

CI-4 is the sole workflow-routing owner.

```text
classifyChangedPaths()
  -> requiredVerificationDomains
  -> CI-4 continuation parameters
  -> CircleCI workflows
```

The routing layer must not independently reinterpret repository paths.

When CI-4 cannot resolve a trustworthy changed-file set, it passes an empty set
to the classifier. The existing empty-input fail-safe therefore selects the full
normal domain set.

Release candidate / release do not rely on changed paths. They use the
classifier execution-context override and the CI-4 release full gate.

## Determinism

Given the same changed paths and execution context, classification must select
the same classes and verification domains.

A classification change that makes an existing full-gate or targeted path
lighter remains a contract change requiring explicit review.
