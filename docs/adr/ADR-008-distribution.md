
# ADR-008: Keep distribution independent from public registry publication

Status: Accepted  
Date: 2026-08-23

## Context

The project needs a reproducible executable build before it needs a public
package-distribution decision.

Prematurely selecting npm publication or another registry would couple MCP API
stabilization to packaging policy.

## Decision

Use TypeScript compilation as the build boundary and keep source,
configuration, lockfiles, tests, and release metadata under version control.

Generated build output is reproducible and is not the source of truth.

Keep public registry publication as a later explicit decision.

Distribution must preserve stdio behavior and must not embed credentials.

## Consequences

The MCP contract can stabilize independently from a public packaging channel.
