
# ADR-008: Build a distributable stdio server without committing generated output

Status: Accepted  
Date: 2026-08-23

## Context

The project currently runs as a TypeScript source repository and the npm
package is marked `private`. The distribution contract must not force a public
registry decision before the MCP API is stable.

## Decision

Use TypeScript compilation as the build boundary:

```text
npm run build
node dist/src/index.js
```

Source code, lockfiles, configuration, tests, and release metadata are version
controlled. Generated build output is reproducible and is not the source of
truth.

The package remains private until a later release explicitly selects a public
distribution channel.

Distribution must preserve:

- stdio transport behavior
- environment-based Redmine configuration
- no embedded API keys or credentials

## Consequences

The project can stabilize its MCP contract independently from npm publication
or other packaging decisions.
