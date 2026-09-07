# ADR-019: Separate Human Review, Handler Validation, and Agent handoff readiness

Status: Accepted  
Date: 2026-09-07

## Context

Phase 35 established a versioned Agent Brief artifact. Phase 37 established
repository-local persistence, immutable Brief revisions, and an approval
reference that can identify the exact stored Brief bytes.

The next boundary is approval lifecycle state in Redmine.

A single generic "approved" state would collapse several materially different
conditions:

1. a Brief exists but still needs Human Review;
2. Human Review is complete but Handler Validation has not succeeded;
3. Handler Validation has succeeded and the approved immutable Brief reference
   is recorded consistently.

Collapsing those states would allow human review completion to be mistaken for
machine validation or Agent handoff permission.

The current Redmine configuration also must not be guessed. Phase 38-1 needs a
logical contract before Phase 38-2 decides whether the states are represented by
Issue Status values, custom fields, or a documented combination.

## Decision

For v0.3.0, use three distinct logical lifecycle states:

```text
Brief Draft
    -> Brief Ready
    -> Ready for Agent
```

Their responsibilities are:

- `Brief Draft`: Human Review or re-review is required. No Agent handoff
  eligibility exists.
- `Brief Ready`: Human Review has completed for a concrete persisted Brief and
  Handler Validation has been requested. Validation may still be pending. No
  Agent handoff eligibility exists.
- `Ready for Agent`: Handler Validation has succeeded for the reviewed artifact
  and the required approval metadata is stored consistently. The Issue is
  eligible for later Agent handoff, but Phase 38 does not execute an Agent.

The direct transition `Brief Draft -> Ready for Agent` is forbidden.

Human Review and Handler Validation remain separate responsibilities. Human
Review selects and accepts a concrete persisted Brief candidate. Handler
Validation verifies the machine-checkable preconditions before handoff.
Requirements-fingerprint calculation and staleness are delegated to Phase 39;
explicit approval orchestration is delegated to Phase 40.

Redmine remains the source of truth for logical lifecycle and approval metadata.
The minimum logical approval metadata is:

```text
approver_identity
approved_at
approved_brief_revision
approved_persisted_revision
approved_requirements_fingerprint
```

The approval record, together with the Redmine Issue context and the canonical
repository mapping, must reconstruct the Phase 37 immutable approval reference:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

`Ready for Agent` is valid only when the lifecycle state and all required
approval metadata agree on that exact artifact. Partial metadata, status-only
success, or metadata-only success must not grant handoff eligibility.

The logical contract does not fix Redmine status names/IDs, custom-field
names/IDs, REST operations, MCP Tool names, or private implementation helpers.
Phase 38-2 must inspect the current Redmine configuration and define the physical
mapping without guessing IDs.

Existing Writer permission, Write Guard, and allowed-project boundaries remain
mandatory for Phase 38 writes.

Queue, claim, lease, heartbeat, retry, running, completed, workspace, execution,
Agent output, CI, Pull Request, and deployment state remain outside the Redmine
approval lifecycle contract.

The exact lifecycle and metadata rules are defined in
`docs/contracts/agent-brief-lifecycle-contract.md`.

## Consequences

Human approval cannot be mistaken for completed Handler Validation because
`Brief Ready` is explicitly non-executable.

A later Agent handoff can require one unambiguous condition:
`Ready for Agent` plus a complete approval record that resolves to the exact
Phase 37 persisted Brief.

The logical contract can be reviewed before changing Redmine configuration, so
Phase 38-2 can choose the physical mapping based on verified environment facts
rather than assumed IDs.

The contract leaves transient validation-request transport and orchestration to
Phase 40 and leaves retry/recovery semantics to Phase 41, avoiding premature
runtime design in Phase 38.

A future change that merges lifecycle states, allows `Brief Ready` to grant
handoff permission, changes the required approval metadata, or moves approval
state out of Redmine requires an explicit contract/ADR change.
