# ADR-027: Use pull-based single-worker Agent Controller

Status: Accepted  
Date: 2026-09-13

## Context

ADR-024 fixes the initial Agent Runner topology at one Controller, one Worker,
and one concurrent execution. ADR-025 keeps durable execution lifecycle state in
Redmine rather than in a Runner-owned queue or database. ADR-026 separates the
execution lifecycle writer from the approval lifecycle writer.

The Controller now needs a deterministic way to discover `Ready for Agent` work
without introducing a distributed scheduling system before the initial topology
requires one.

A push / Webhook dependency would add another runtime entry path and operational
surface to the first execution release. A mutable Redmine saved query would also
make runtime eligibility depend on server-side UI configuration rather than the
explicit system contract.

Controller restart introduces a separate safety concern. If ordinary polling
starts before existing durable `Agent Running` state is reconciled, the Runner
can accept new work without first accounting for an execution that may have been
interrupted by the restart.

Phase 45-4 therefore needs to fix candidate polling, startup ordering, and the
last durable boundary before Agent start without implementing the execution
loop itself.

## Decision

Use a pull-based Controller for the initial v0.4.0 Agent Runner.

Poll Redmine only while the Controller is idle. With one Worker and concurrency
one, continuing to poll for additional work during an active execution is not a
v0.4.0 requirement.

Use a configurable polling interval with an initial default of:

```text
30 seconds
```

Select candidates using bounded direct filtering equivalent to:

```text
allowed project
+
status = Ready for Agent
```

Do not make a mutable Redmine saved query a required runtime contract. The exact
Redmine API call, page size, candidate ordering, and loop implementation remain
implementation details as long as selection stays bounded and preserves the
contracted filters.

Do not require Webhook-based execution for v0.4.0. A future Webhook entry path
may be considered separately, but it must not silently create a second
execution writer or bypass the same validation boundary.

Perform startup reconciliation before normal polling:

```text
Controller startup
  -> startup reconciliation
  -> idle
  -> poll
```

The Controller must not skip incomplete startup reconciliation and begin normal
candidate polling. The concrete recovery algorithm remains a Phase 48
responsibility.

Use the following ordered poll-to-execution boundary:

```text
poll
  -> Ready for Agent candidate
  -> local duplicate prevention
  -> Issue re-fetch
  -> approval / eligibility validation
  -> requirements revalidation
  -> exact source revision determination
  -> execution record preparation
  -> Agent Running durable mutation
  -> Agent start
```

A polled candidate is not sufficient authorization to start an Agent. The Issue
must be re-fetched and validated before execution.

If pre-execution validation fails, do not start the Agent. Preserve the Phase
45-3 `Needs Human + outcome` boundary.

Do not start the Agent until the durable Redmine mutation to `Agent Running`
succeeds. If that mutation fails or cannot be established as successful, stop
before Agent start.

Do not introduce a distributed queue, distributed claim, lease, heartbeat, or
other distributed coordination mechanism for the initial single-Controller /
single-Worker topology.

This ADR fixes polling and ordering semantics only. It does not define the
polling-loop implementation, local-lock mechanism, Redmine client
implementation, eligibility algorithm, requirements-fingerprint algorithm,
source-revision implementation, execution-record schema, startup recovery
algorithm, Worker implementation, or Agent Adapter implementation.

## Consequences

The initial Runner can discover work through one durable control-plane Source of
Truth without adding a second scheduler database or queue.

Idle-only polling matches concurrency one and avoids creating an implied backlog
of locally claimed work while the Worker is already executing.

The 30-second default gives the first release a concrete operating cadence while
remaining configurable when deployment needs change.

Direct allowed-project and `Ready for Agent` filtering keeps candidate selection
explicit and reviewable instead of depending on mutable saved-query
configuration.

Startup reconciliation has priority over new work. A restarted Controller must
account for existing durable execution state before it resumes normal polling.

Re-fetch and validation separate candidate discovery from execution
authorization. Stale or otherwise invalid work fails before an Agent process is
started.

The durable `Agent Running` mutation becomes the final control-plane gate before
Agent start, so a newly started Agent is always paired with durable lifecycle
state indicating that execution has begun.

The design remains intentionally simple for one Controller / one Worker. If the
system later introduces multiple Runner instances, multiple Workers, or multiple
independent execution entry points, distributed coordination can be evaluated
as a separate architecture change rather than being embedded prematurely in the
v0.4.0 contract.
