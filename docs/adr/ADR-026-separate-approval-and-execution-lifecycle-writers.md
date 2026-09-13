# ADR-026: Separate approval and execution lifecycle writers

Status: Accepted  
Date: 2026-09-13

## Context

v0.3.0 establishes the approval lifecycle through `Ready for Agent`. Human
Review and Handler Validation remain separate, and the Approval Handler owns the
machine-validated transition into the execution handoff state.

v0.4.0 adds an execution lifecycle after that handoff. Agent Controller must be
able to move eligible work into execution, publish a verifiable execution
result, or stop at a human-attention boundary when execution cannot safely
continue.

Without an explicit writer boundary, Agent Controller could accidentally become
an alternative approval workflow by writing `Brief Draft`, `Brief Ready`, or
approval metadata when execution-time validation fails. That would mix the
approval and execution state machines and would allow execution code to
reinterpret decisions owned by Human Review and Handler Validation.

Execution failures also need more detail than a single lifecycle status can
express. Creating one Redmine Status for every failure mode would make the
business workflow depend on low-level execution diagnostics and would expand
the status model each time a new execution failure is introduced.

Phase 45-3 therefore needs to separate lifecycle routing from concrete execution
result identity before Phase 46 through Phase 49 implement those behaviors.

## Decision

Keep Approval Handler and Agent Controller as separate lifecycle writers.

Approval Handler owns the approval-side write set:

```text
Brief Draft
Brief Ready
Ready for Agent
```

Approval Handler does not write:

```text
Agent Running
Ready for Independent Verification
Needs Human
```

Agent Controller owns the execution-side target set:

```text
Agent Running
Ready for Independent Verification
Needs Human
```

Agent Controller does not write `Brief Draft` or `Brief Ready`, does not rewrite
approval metadata, does not perform Human Review, and does not redefine Handler
Validation semantics.

Use the following normal execution lifecycle:

```text
Ready for Agent
  -> Agent Running
  -> Ready for Independent Verification
```

For a validation failure detected before Agent start, do not start the Agent and
do not roll the Issue back into the approval lifecycle. Route to `Needs Human`
and preserve the reason as an execution outcome.

Use:

```text
Needs Human + stale_requirements
```

for a requirements-fingerprint mismatch, and:

```text
Needs Human + eligibility_failed
```

for other pre-execution eligibility failures. Detailed eligibility rules remain
Phase 46 responsibilities.

Separate Redmine Status from execution outcome:

```text
Redmine Status
  = lifecycle category / routing state

execution outcome
  = concrete execution result or failure reason
```

The minimum v0.4.0 outcome identity set is:

```text
changes_ready
no_changes

stale_requirements
eligibility_failed

interrupted
timeout
agent_start_failed
agent_failed

artifact_persistence_failed
```

`changes_ready` and `no_changes` route to
`Ready for Independent Verification`. Pre-execution validation failures and
execution failures route to `Needs Human` with the corresponding outcome.

This ADR fixes writer ownership, lifecycle semantics, and outcome identity. It
does not define execution-record schema, physical Redmine field mapping,
detailed eligibility algorithms, timeout or retry implementation, Agent Adapter
implementation, polling behavior, or artifact serialization.

Changing the approval / execution writer boundary, allowing Agent Controller to
rewrite approval state, or collapsing Status and outcome into a failure-specific
status model requires an explicit contract / ADR change.

## Consequences

Approval decisions remain owned by the approval workflow even when execution-
time validation discovers stale or otherwise ineligible work.

Agent Controller can fail closed without impersonating Human Review or Handler
Validation. A stale candidate stops at `Needs Human`; a human or the approval
workflow decides how to re-establish an approved handoff.

The normal execution path has one execution writer and one clear routing path
from `Ready for Agent` to independent verification.

Redmine Status remains compact and business-oriented while outcome preserves the
specific execution result or failure reason needed for diagnosis and later
recovery logic.

Later phases can refine the production conditions for eligibility failures,
Agent failures, interruption, timeout, no-change results, and artifact failures
without adding new lifecycle statuses for each condition.

Physical storage and mutation details remain free to evolve within the fixed
contract boundary. They must not create a second writer for approval lifecycle
or change the defined Status / outcome semantics implicitly.
