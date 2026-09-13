# ADR-024: Separate Agent Runner execution plane from Redmine MCP control plane

Status: Accepted  
Date: 2026-09-13

## Context

v0.3.0 establishes `Ready for Agent` as the final Agent Brief handoff boundary.
The next release must consume that approved handoff and execute an Agent without
turning the Redmine MCP Server into an Agent runtime.

Agent execution has a materially different threat model from the Redmine / MCP
approval control plane. It requires source checkout, writable filesystem state,
Agent process execution, execution-time network access, and later artifact
handling. Co-locating those responsibilities with the Redmine / MCP process
would expand the control-plane credential and process boundary and would make
execution failures part of the MCP host lifecycle.

The two components also evolve for different reasons. Redmine MCP owns bounded
Redmine access and approval-control contracts, while Agent Runner owns execution
behavior. Requiring identical component version numbers would couple release
cadence without expressing actual compatibility.

Phase 45 therefore needs to fix the repository / deployment boundary and release
ownership before Runner implementation begins.

## Decision

Use a dedicated Agent Runner execution plane separate from the Redmine MCP
control plane.

The component boundary is:

```text
mcp-mamono210/redmine
  = Redmine / MCP / approval control plane

mcp-mamono210/ai-agent-runner
  = Agent execution plane
```

The Agent Runner uses a separate repository, separate GCE deployment, separate
credentials, and a separate execution sandbox.

The Redmine / MCP host must not spawn Agent processes. Agent process creation is
owned by the Agent Runner deployment.

Use the following initial execution topology for v0.4.0:

```text
Controller = 1
Worker = 1
concurrent execution = 1
```

Do not introduce multiple Runner instances, multiple Workers, distributed
claim / lease / heartbeat, or another distributed coordination mechanism merely
to satisfy the initial topology.

Version Redmine MCP and Agent Runner independently using their own SemVer
streams. Do not require lockstep component version numbers.

Treat `v0.4.0` as a system-level compatibility milestone rather than the SemVer
of either component. The system milestone must be able to identify, at minimum:

```text
platform milestone
Redmine MCP version
Agent Runner version
handoff contract revision
execution / artifact contract revision
```

The concrete manifest representation is intentionally deferred to a later
responsibility.

Keep the canonical cross-component Phase 45 contract in the Redmine MCP
repository at:

```text
docs/contracts/agent-runner-execution-boundary-contract.md
```

A future Agent Runner repository may reference this contract but must not create
a competing authoritative copy of the same system boundary.

## Consequences

Agent execution failures, filesystem mutation, and Agent process lifecycle are
kept out of the Redmine / MCP process boundary.

The control plane and execution plane can use different least-privilege
credentials and deployment policies without sharing one runtime identity.

The initial single-Controller / single-Worker design keeps execution ownership
simple and does not require distributed coordination before scale demands it.

Redmine MCP and Agent Runner can release at independent cadences. Compatibility
is expressed by the system milestone and the component / contract revisions
verified together, rather than by matching version strings.

Cross-component release preparation must eventually record the compatible
component versions and contract revisions. Phase 45-1 defines that traceability
requirement but does not define manifest serialization.

Operationally, the system now has at least two separately deployed components
and therefore requires explicit deployment and compatibility management.

Code that assumes the Agent shares the Redmine / MCP host filesystem, process
space, or credentials is incompatible with this decision.

Moving Agent execution back into the Redmine / MCP process, requiring lockstep
component versions, or introducing distributed execution as an initial
requirement requires a future explicit contract / ADR change.
