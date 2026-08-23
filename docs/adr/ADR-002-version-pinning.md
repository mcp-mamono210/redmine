# ADR-002: Pin reproducible dependencies and runtime boundaries

Status: Accepted  
Date: 2026-08-23

## Context

Runtime and dependency drift can change build, lint, test, and MCP behavior
without a source-code change.

A CircleCI machine image alone is not a sufficient Node.js contract because
the Node.js version available in that image can change independently.

## Decision

Use explicit reproducibility boundaries:

- `.nvmrc` is the source of truth for the exact Node.js runtime
- `package.json` declares the same runtime through `engines.node`
- CircleCI installs Node.js from `.nvmrc`
- CircleCI verifies the active Node.js version before `npm ci`
- `package-lock.json` remains authoritative for npm dependency resolution
- deterministic Redmine Docker images remain explicitly pinned

The currently pinned runtime is:

```text
Node.js 24.19.0
```

Local development uses:

```bash
nvm install
nvm use
```

CI uses the same `.nvmrc` value rather than relying on a preinstalled Node.js
runtime from the machine image.

The CircleCI operating-system image is a separate reproducibility boundary and
is not changed by this decision.

## Consequences

Local development and CI use the same Node.js runtime.

A Node.js upgrade becomes an explicit reviewed change that updates `.nvmrc`,
`package.json`, CircleCI configuration, README, and this ADR together.

Supporting multiple Node.js major versions or introducing a runtime matrix
requires a separate compatibility decision rather than silently loosening this
pin.
