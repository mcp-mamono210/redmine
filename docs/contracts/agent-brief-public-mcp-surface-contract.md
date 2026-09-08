# Agent Brief Public MCP Surface Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the final v0.3.0 public MCP surface for the Agent Brief
approval workflow after Phase 41 idempotency and recovery behavior is active.

It consolidates the public-surface facts that are split across the Phase 40
approval-handler contract and the Phase 41 idempotency / recovery contract.
It does not redefine persistence, lifecycle, requirements fingerprint, or
recovery business logic.

Source contracts remain authoritative for their domain rules:

- `docs/contracts/agent-brief-approval-handler-contract.md`
- `docs/contracts/agent-brief-approval-idempotency-recovery-contract.md`

This contract is authoritative for the final published Tool name, publication
boundary, input/output schema, annotations, and Context Budget integration.

## Published Tool

The v0.3.0 Agent Brief public surface adds exactly one workflow-specific write
Tool:

```text
redmine_approve_agent_brief
```

No generic custom-field Tool, generic lifecycle Tool, or Agent execution Tool is
introduced.

## Tool Registry and publication boundary

The Tool Registry entry is:

```text
name   = redmine_approve_agent_brief
access = write
```

Publication follows the existing write-publication boundary:

```text
REDMINE_WRITE_ENABLED=false
  -> redmine_approve_agent_brief is absent from tools/list

REDMINE_WRITE_ENABLED=true
  -> redmine_approve_agent_brief is eligible for publication
```

Runtime project authorization remains enforced by the existing Write Guard and
`REDMINE_ALLOWED_PROJECTS` before any lifecycle or approval metadata mutation.

## Input schema

The public input contains exactly the reviewed immutable-reference components:

```json
{
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>"
}
```

Rules:

| Field | Rule |
| --- | --- |
| `issue_id` | Positive safe integer. |
| `brief_revision` | Positive safe integer. |
| `persisted_revision` | Non-blank string; opaque to the public contract. |

Repository identity, approval metadata, requirements fingerprint, lifecycle
target, and Redmine custom-field IDs are not caller-controlled inputs.

## Successful output schema

Successful calls return one of exactly three domain outcomes:

```text
approved
stale
validation_failed
```

The public response uses `snake_case` and is emitted in both:

```text
content[0].text
structuredContent
```

The two representations MUST be equivalent.

The Tool declares an `outputSchema` covering all successful variants.

### approved

Required public fields:

```text
outcome
issue_id
brief_revision
persisted_revision
requirements_fingerprint
lifecycle = Ready for Agent
approver_identity
approved_at
handoff_eligible = true
```

### stale

Required public fields:

```text
outcome
issue_id
brief_revision
persisted_revision
persisted_requirements_fingerprint
current_requirements_fingerprint
lifecycle = Brief Draft
handoff_eligible = false
```

### validation_failed

Required public fields:

```text
outcome
issue_id
brief_revision
persisted_revision
reason
handoff_eligible = false
```

The final v0.3.0 `reason` set is:

```text
lifecycle_not_brief_ready
reviewed_reference_invalid
fingerprint_unavailable
approval_conflict
```

`approval_conflict` is the Phase 41 extension. Transport uncertainty, retry
exhaustion, backend unavailability, and unresolved recovery remain application
errors rather than clean `validation_failed` results.

## Final Tool annotations

Once Phase 41 behavior is active, the final published annotations are:

```text
readOnlyHint = false
destructiveHint = false
idempotentHint = true
openWorldHint = true
```

`idempotentHint = true` means repeated exact approval requests converge by
source-of-truth reconciliation. It does not permit unbounded retries or bypass
Write Guard / project authorization.

## Description obligations

The public description MUST communicate that:

- the action is an explicit write for one human-reviewed immutable Agent Brief;
- a new approval requires `Brief Ready`;
- CURRENT may become `Ready for Agent`;
- STALE returns to `Brief Draft`;
- exact completed approvals may reconcile idempotently;
- ambiguous writes use bounded recovery;
- the Tool does not execute an Agent.

## Context Budget integration

Phase 42-3 keeps the committed v0.2.0 read-only Context Budget baseline intact
and adds a reviewed v0.3.0 Agent Brief public-surface budget overlay.

The Context Budget gate MUST measure at least:

```text
write-enabled tools/list delta
redmine_approve_agent_brief Tool definition
approval outputSchema
representative approved response
representative approval public-workflow context
```

The machine-readable budget ceilings are stored in:

```text
tests/e2e/agent-brief-public-surface-budget.json
```

The canonical Context Budget command MUST run both the existing baseline
measurement and the Agent Brief public-surface budget regression.

Budget changes are reviewed repository changes. CI MUST NOT rewrite either the
read-only baseline or the Agent Brief public-surface budget.

## Regression obligations

Executable coverage MUST prove at least:

- the Tool Registry contains exactly one Agent Brief approval write Tool;
- write-disabled publication excludes the Tool;
- write-enabled publication includes the Tool;
- the input schema remains the reviewed-reference schema;
- the output schema includes `approved`, `stale`, and `validation_failed`;
- `approval_conflict` remains a valid Phase 41 validation reason;
- successful text JSON and `structuredContent` remain equivalent;
- final annotations include `idempotentHint = true`;
- Context Budget measures the actual write-enabled public surface;
- the Agent Brief public-surface budget regression runs in the canonical
  Context Budget command.
