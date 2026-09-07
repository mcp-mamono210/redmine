# ADR-022: Use one guarded MCP Tool for explicit Agent Brief approval

Status: Accepted  
Date: 2026-09-07

## Context

ADR-019 separates Human Review, Handler Validation, and `Ready for Agent`.
ADR-020 maps lifecycle and approval metadata to dedicated Redmine custom fields.
ADR-021 defines requirements-fingerprint semantics, and Phase 39 implements the
CURRENT / STALE detection boundary.

Phase 40 now needs one explicit human entry point that can request Handler
Validation for the exact persisted Brief a human reviewed.

The repository already has two relevant architectural constraints:

- ADR-003 keeps the MCP tool surface small and domain-oriented rather than
  exposing generic CRUD;
- the Tool Registry already classifies entries as read or write and omits write
  entries when the write-publication guard is disabled.

Several entry-point designs are possible:

1. expose a generic lifecycle/custom-field write Tool and let the caller compose
   approval steps;
2. expose only a local CLI for approval;
3. expose one narrow MCP Tool that represents the complete explicit Agent Brief
   approval workflow and delegates business rules to an internal Handler.

A generic write Tool would allow callers to bypass the approval invariants that
Phases 37-39 established. A CLI-only contract would create a second primary
control surface even though the product's user-facing workflow is already MCP
and the write-publication guard exists there.

The explicit request also must identify the exact human-reviewed immutable
artifact. Accepting only an Issue ID would permit the implementation to silently
substitute a newer "current" Brief, which ADR-019 explicitly forbids.

## Decision

For v0.3.0, expose one narrow public MCP write Tool:

```text
redmine_approve_agent_brief
```

The Tool accepts exactly the reviewed reference components that the caller must
bind explicitly:

```text
issue_id
brief_revision
persisted_revision
```

The repository is taken from canonical Phase 37 persistence configuration, not
from caller input.

The Tool does not accept caller-supplied approval metadata. In particular:

- approver identity is derived from the authenticated Redmine principal;
- approval time is captured by the Phase 40 operation;
- requirements fingerprint is calculated/validated by the Phase 39 boundary;
- lifecycle target is determined by the Handler result.

The MCP layer is a thin adapter. The Phase 40 Approval Handler owns the business
orchestration. It reuses:

- Phase 37 persistence reads;
- Phase 38 lifecycle metadata boundary and Write Guard;
- Phase 39 staleness detection.

It must not create an alternate generic Redmine custom-field writer.

The public successful outcome model distinguishes:

```text
approved
stale
validation_failed
```

`STALE` is a valid domain result only when both fingerprints were available and
unequal. It causes the existing guarded lifecycle boundary to reset
`Brief Ready -> Brief Draft`.

A CURRENT result may proceed to `Ready for Agent` only after the exact reviewed
reference is validated and complete approval metadata is constructed. Success
is returned only after read-back proves the final lifecycle and metadata are
consistent.

`INVALID_REFERENCE` and `FINGERPRINT_UNAVAILABLE` remain validation failures and
are not treated as STALE.

The Tool Registry classifies this Tool as `write`. It is not published when the
existing write-publication guard is disabled, and project allowlist checks still
apply before mutation.

Phase 40 does not define repeat-call idempotency or interrupted-write recovery.
Those remain Phase 41 responsibilities.

No public approval CLI is part of the v0.3.0 Phase 40 contract. A future CLI may
exist as an adapter only if it invokes the same Handler and does not become a
second business-logic implementation.

The exact public schema and orchestration rules are defined in
`docs/contracts/agent-brief-approval-handler-contract.md`.

## Consequences

The public surface gains one workflow-specific write Tool rather than a generic
mutation capability.

The caller must explicitly bind approval to the exact immutable Brief it
reviewed, preventing silent substitution of a newer revision.

Approver identity and approval timestamp cannot be freely spoofed through MCP
input because they are not caller-controlled fields.

The existing Tool Registry write classification and Write Guard can protect
publication and project-level mutation without a parallel security path.

A stale Brief is reset for re-review, while unavailable validation data remains
distinguishable from a true requirements mismatch.

Tool output remains bounded because approval returns only stable identifiers,
fingerprints, lifecycle state, and a small result discriminator rather than
Issue or Brief bodies.

Phase 41 can add explicit idempotency/recovery semantics later without making
Phase 40 responsible for rollback or replay.

Adding a generic lifecycle Tool, accepting arbitrary approval metadata from the
caller, changing the reviewed-reference identity, switching the primary public
entry point away from MCP, or changing successful public outcomes requires an
explicit contract/ADR change.
