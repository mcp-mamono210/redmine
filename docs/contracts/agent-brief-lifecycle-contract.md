# Agent Brief Lifecycle and Approval Metadata Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the Phase 38 logical lifecycle and approval-metadata
contract for versioned Agent Briefs.

Phase 35 defines the Agent Brief artifact. Phase 37 binds each Brief revision to
an immutable persisted revision. Phase 38 defines how Human Review and Handler
Validation are separated before a persisted Brief becomes eligible for handoff
to a later Agent execution system.

This contract is intentionally independent from concrete Redmine status IDs,
custom-field IDs, REST operations, MCP Tool names, or private implementation
helpers. Phase 38-2 maps this logical contract to the current Redmine
configuration, and Phase 38-3 implements the corresponding application
boundary.

## Source-of-truth boundary

The responsibilities remain separated as follows:

```text
Redmine
  -> requirements, priority, business state, logical Brief lifecycle,
     and approval metadata

Versioned Brief storage
  -> Agent Brief content, Brief revision history, and immutable
     persisted-revision identity

Phase 39
  -> requirements-fingerprint canonicalization and staleness comparison

Phase 40
  -> explicit approval entry point and Handler Validation orchestration

Future runtime components
  -> queue, claim, lease, heartbeat, retry, workspace, execution,
     Agent output, CI, Pull Request, and deployment state
```

Phase 38 must not move Brief content history into Redmine, and it must not move
approval or business state into Brief storage.

## Logical lifecycle

The v0.3.0 Agent Brief lifecycle has exactly these logical states:

```text
Brief Draft
    |
    | Human Review completed and Handler Validation requested
    v
Brief Ready
    |
    | Handler Validation succeeded and required approval metadata
    | is stored consistently
    v
Ready for Agent
```

These names are logical lifecycle values. This contract does not assert that
Redmine currently has Issue Status records with these names. The physical
representation is owned by Phase 38-2.

## State semantics

### Brief Draft

`Brief Draft` means:

- a Brief exists or is expected to be regenerated for the Issue;
- Human Review or re-review is required before approval can continue;
- Handler Validation success has not granted handoff eligibility;
- the Issue is not eligible for Agent execution or Agent handoff.

A newly generated or materially revised human-reviewable Brief returns to this
state before another approval attempt.

### Brief Ready

`Brief Ready` means:

- a human has completed review of one concrete persisted Brief revision;
- Handler Validation has been requested for that reviewed artifact;
- Handler Validation has not yet established the final approval result;
- the Issue is not eligible for Agent execution or Agent handoff.

`Brief Ready` therefore includes the validation-pending interval. It must never
be interpreted as a synonym for `Ready for Agent`.

The exact representation of a validation request is not defined here. Phase 40
owns the explicit approval entry point and Handler Validation orchestration. A
consumer must not silently substitute a newer mutable "current Brief" for a
specific reviewed reference already supplied to validation.

### Ready for Agent

`Ready for Agent` means:

- Human Review has completed for the approved artifact;
- Handler Validation has succeeded for that same artifact;
- all required approval metadata is available and mutually consistent;
- the approved Brief can be traced to an immutable Phase 37 persisted revision;
- the Issue is eligible to be handed off to a later Agent execution system.

`Ready for Agent` does not itself execute an Agent. Agent execution remains out
of scope for v0.3.0 Phase 38.

## Human Review and Handler Validation responsibilities

Human Review and Handler Validation are distinct responsibilities.

Human Review establishes that a human accepts the content of one concrete
versioned Brief as the candidate for approval. The reviewed target must be
specific enough to recover the Phase 37 immutable artifact rather than only the
mutable notion of "current".

Handler Validation establishes machine-checkable preconditions before handoff.
Phase 38 does not define the requirements-fingerprint algorithm or staleness
comparison; those are Phase 39 responsibilities. Phase 40 consumes this
lifecycle contract together with Phase 39 validation to perform the explicit
approval operation.

A successful Human Review is necessary but not sufficient for
`Ready for Agent`.

## Transition contract

The normal forward transitions are:

```text
Brief Draft -> Brief Ready
Brief Ready -> Ready for Agent
```

`Brief Draft -> Brief Ready` is permitted only when Human Review has completed
for a concrete Brief revision and Handler Validation has been requested.

`Brief Ready -> Ready for Agent` is permitted only when Handler Validation has
succeeded for the same reviewed artifact and the required approval metadata can
be stored as one logically consistent approval record.

The following transition is forbidden:

```text
Brief Draft -> Ready for Agent
```

No caller may bypass `Brief Ready` to represent Human Review and Handler
Validation as one indistinguishable state.

A later phase may require a return to `Brief Draft` when the reviewed artifact
must be regenerated or re-reviewed, including a stale-result path. This
contract permits such a review-required reset but deliberately does not define
the fingerprint algorithm, stale trigger, orchestration, or retry policy.
Those responsibilities belong to Phase 39, Phase 40, and Phase 41.

No lifecycle transition defined here represents Queue, running, completed, or
other Agent runtime state.

## Approval metadata logical schema

Redmine is the source of truth for approval metadata.

The minimum logical approval record contains:

| Logical field | Meaning |
| --- | --- |
| `approver_identity` | The human identity whose review approved the Brief candidate. The concrete Redmine identity representation is defined by Phase 38-2. |
| `approved_at` | The time of the human approval decision associated with this approval attempt. It is not implicitly the Handler completion time. |
| `approved_brief_revision` | The positive Phase 35 `brief_revision` of the approved artifact. |
| `approved_persisted_revision` | The opaque immutable Phase 37 persisted revision identifying the approved Brief bytes. |
| `approved_requirements_fingerprint` | The approved Brief's requirements fingerprint. Phase 38 treats this as an opaque value; Phase 39 owns calculation and comparison. |

Phase 38-2 maps these logical fields to the current Redmine representation. The
mapping must not guess unknown custom-field IDs or silently reuse unrelated
fields.

Additional Redmine fields may exist, but they do not change the meaning of the
five required logical approval values.

## Phase 37 approval-reference compatibility

Phase 37 defines the immutable approval-reference tuple as:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

A Phase 38 approval record must allow a later consumer to reconstruct that tuple
unambiguously.

The Redmine Issue itself supplies `redmine_issue_id`. The approval record
supplies `approved_brief_revision` and `approved_persisted_revision`. The
repository must be resolvable without guessing from the Phase 38-2 mapping or
other canonical application configuration.

If the repository cannot be resolved unambiguously, the approval reference is
invalid and consumers must fail closed.

A consumer must verify that the stored Brief at the reconstructed Phase 37
reference has the expected Issue identity, Brief revision, persisted revision,
and repository before treating the approval record as valid.

## Approval metadata consistency

`Ready for Agent` is valid only when all required approval metadata is present
and consistent with the exact persisted Brief that Handler Validation accepted.

Partial metadata must not grant handoff eligibility. Status-only success must
not grant handoff eligibility. Metadata-only success must not grant handoff
eligibility.

Other lifecycle states never grant handoff eligibility, even if stale or
partially written approval-looking fields are present. A consumer that observes
an inconsistent lifecycle/metadata combination must fail closed rather than
infer approval.

Atomicity, retry, and recovery for interrupted approval writes are Phase 41
responsibilities. This contract defines the valid logical end state that those
mechanisms must preserve.

## Requirements fingerprint boundary

`approved_requirements_fingerprint` is stored as approval metadata, but Phase 38
does not define how the fingerprint is calculated or decide whether it is
stale.

Phase 39 owns:

- canonical requirements input;
- fingerprint calculation;
- comparison with the Brief fingerprint;
- stale-result semantics.

Phase 40 may store the validated fingerprint as part of the successful approval
record only after applying the Phase 39 contract.

## Execution-permission rule

Only `Ready for Agent` may be interpreted as handoff eligibility.

Neither of these states grants execution permission:

```text
Brief Draft
Brief Ready
```

An implementation must not infer Agent execution permission from:

- Human Review completion alone;
- the presence of an approver value alone;
- a persisted Brief existing in Git;
- a Brief being the current revision;
- `Brief Ready`;
- partial approval metadata.

The actual Agent Runner / Worker lifecycle remains outside v0.3.0 Phase 38.

## Redmine mapping boundary

This contract defines logical values only.

Phase 38-2 must inspect the current Redmine configuration and choose a physical
representation that can map both directions without ambiguity:

```text
logical lifecycle / approval metadata
    <->
current Redmine representation
```

Possible representations include dedicated Issue Status values, dedicated
custom fields, or a documented combination, but this contract does not select
one before the current environment is inspected.

Unknown status IDs or custom-field IDs must not be hard-coded as if they were
verified configuration.

## Security and write boundary

Any Phase 38 write path must preserve the existing Writer permission, Write
Guard, and allowed-project boundary.

This lifecycle contract does not introduce:

- a generic Redmine write API;
- a public MCP lifecycle Tool;
- arbitrary custom-field mutation;
- project-boundary bypass;
- a write path that skips the existing security composition root.

If a future public Tool or schema is required, it is a separate public-contract
change.

## Excluded runtime state

The lifecycle and approval metadata contract must not store or interpret Agent
runtime state such as:

```text
queue
claim
lease
heartbeat
retry
running
completed
workspace
execution_state
agent_output
ci_state
pull_request_state
deployment_state
```

Those values do not become approval metadata merely because Redmine can store
custom fields.

## Fail-closed semantic failures

Implementations may choose private error types, but Phase 38 consumers must be
able to treat at least these conditions as failure rather than approval:

```text
unknown_lifecycle_state
invalid_lifecycle_transition
approval_metadata_incomplete
approval_reference_mismatch
approval_repository_ambiguous
```

The exact public or private error representation is not fixed by this contract.
Diagnostics must not disclose credentials or secret values.

## Phase handoff

Phase 38-2 maps this logical contract to the actual Redmine configuration and
resolves any configuration gaps.

Phase 38-3 implements and verifies the lifecycle/approval-metadata application
boundary while preserving the existing security boundary.

Phase 39 defines requirements-fingerprint canonicalization and staleness.

Phase 40 performs the explicit Human Approval / Handler Validation operation
that may transition `Brief Ready` to `Ready for Agent`.

Phase 41 owns approval idempotency and interrupted-update recovery.
