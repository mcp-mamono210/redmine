# Agent Runner Redmine Execution Field Provisioning / Verification Record

Status: Verified current-environment alignment for unreleased v0.4.0  
Verified: 2026-09-13  
Verification Issue: `#5402`  
Owner: Redmine administrator / deployment operator  
Canonical contract: `docs/contracts/agent-runner-execution-input-contract.md`

## Purpose

This document records the Phase 46-5 Redmine execution-field provisioning and
post-provisioning verification for the current environment. It is not a second
canonical schema. Portable field names, types, constraints, lifecycle semantics,
and `execution_id` serialization are authoritative only in the canonical Phase
46 contract referenced above.

The administrative custom-field inventory endpoint returns HTTP `403` for the
integration credential, so the verification deliberately uses target-Issue
visibility plus guarded writer/read-back behavior rather than requiring global
Redmine administration access at runtime.

## Target scope

```text
project: Redmine
observed project id: 414
tracker: 機能
observed tracker id: 2
verification Issue: #5402
```

Observed numeric IDs are environment facts. Do not copy them between test and
production and do not turn them into canonical application constants.

## Provisioned fields

The current environment exposes all fourteen fields below on the target scope.
The `Agent Exec ...` abbreviations are intentional: this Redmine environment
enforces a 30-character custom-field name limit.

| # | Exact field name | Type / representation | Required configuration |
| ---: | --- | --- | --- |
| 1 | `Agent Execution Lifecycle` | single-value list | `Agent Running`, `Ready for Independent Verification`, `Needs Human`; not globally required |
| 2 | `Agent Rejection At` | string | RFC 3339 with timezone/offset; maximum 64 characters; not globally required |
| 3 | `Agent Rejection Outcome` | single-value list | `stale_requirements`, `eligibility_failed`; not globally required |
| 4 | `Agent Rejection Diagnostic` | text | application limit 2048 characters after redaction; not globally required |
| 5 | `Agent Execution ID` | string | exactly 36-character lowercase UUIDv4; not globally required |
| 6 | `Agent Exec Brief Revision` | integer | positive integer; not globally required |
| 7 | `Agent Exec Persisted Revision` | text | non-empty; application limit 1024 characters; not globally required |
| 8 | `Agent Exec Req Fingerprint` | string | exactly 71 characters: lowercase `sha256:` + 64 lowercase hex; not globally required |
| 9 | `Agent Execution Repository` | string | maximum 255 characters; non-secret; not globally required |
| 10 | `Agent Exec Source Revision` | string | full non-abbreviated lowercase hexadecimal Git object ID; maximum 128 characters; not globally required |
| 11 | `Agent Execution Started At` | string | RFC 3339 with timezone/offset; maximum 64 characters; not globally required |
| 12 | `Agent Execution Finished At` | string | empty or RFC 3339; maximum 64 characters; not globally required |
| 13 | `Agent Execution Outcome` | single-value list | `changes_ready`, `no_changes`, `interrupted`, `timeout`, `agent_start_failed`, `agent_failed`, `artifact_persistence_failed`; empty while pending; not globally required |
| 14 | `Agent Artifact Reference` | text | empty while pending; application limit 2048; non-secret; signed URLs/tokens forbidden; not globally required |

Do not reuse any v0.3.0 Agent Brief lifecycle / approval field and do not reuse
`release_tag`.

## Current environment binding

The following IDs were observed from the current target Issue payload on
2026-09-13:

| Exact field name | Observed custom-field ID |
| --- | ---: |
| `Agent Execution Lifecycle` | 11 |
| `Agent Rejection At` | 12 |
| `Agent Rejection Outcome` | 13 |
| `Agent Rejection Diagnostic` | 14 |
| `Agent Execution ID` | 15 |
| `Agent Exec Brief Revision` | 16 |
| `Agent Exec Persisted Revision` | 17 |
| `Agent Exec Req Fingerprint` | 18 |
| `Agent Execution Repository` | 19 |
| `Agent Exec Source Revision` | 20 |
| `Agent Execution Started At` | 21 |
| `Agent Execution Finished At` | 22 |
| `Agent Execution Outcome` | 23 |
| `Agent Artifact Reference` | 24 |

This table is a current-environment verification record only. The portable
contract remains name / type / constraint based. Another Redmine environment may
assign different IDs and must establish its own exact-name binding.

## Writer / read-back verification

Verification Issue #5402 exercised the current writer and reader against the
provisioned fields.

### Pre-execution rejection

The writer successfully persisted and the reader returned the exact values for:

```text
Agent Execution Lifecycle = Needs Human
Agent Rejection At = RFC 3339 timestamp
Agent Rejection Outcome = eligibility_failed
Agent Rejection Diagnostic = synthetic non-secret diagnostic
```

`Agent Execution ID` and execution-only start / finish / artifact fields remained
empty, confirming that a pre-execution rejection does not require an execution
attempt record.

### Agent Running durable start mutation

One combined synthetic start mutation successfully persisted and read back:

```text
Agent Execution Lifecycle = Agent Running
Agent Execution ID = lowercase UUIDv4
Agent Exec Brief Revision = positive integer
Agent Exec Persisted Revision = synthetic persisted revision
Agent Exec Req Fingerprint = sha256:<64 lowercase hex>
Agent Execution Repository = mcp-mamono210/redmine
Agent Exec Source Revision = exact Git commit test value
Agent Execution Started At = RFC 3339 timestamp
```

The exact requirements fingerprint is 71 characters and was successfully stored
and read back without truncation. At the same start boundary these fields were
left empty as required:

```text
Agent Execution Finished At
Agent Execution Outcome
Agent Artifact Reference
```

### List constraints

Canonical execution lifecycle, rejection outcome, and execution outcome values
were accepted by Redmine. The execution outcome verification included `timeout`.
An `INVALID_VALUE` execution lifecycle write was rejected with HTTP `422` and
was not persisted.

### Journal / isolation / cleanup

Redmine journal history recorded the synthetic field changes. The verification
did not repurpose `release_tag` or any v0.3.0 approval metadata field. At the end
of the test, all synthetic execution / rejection values were cleared and a final
read-back confirmed the fourteen fields were empty.

## Verification checklist

- [x] All fourteen fields are visible exactly once in the target Issue payload.
- [x] Exact field names comply with the observed 30-character Redmine name limit.
- [x] `Agent Execution Lifecycle` accepts the canonical lifecycle values.
- [x] `Agent Rejection Outcome` accepts `stale_requirements` and `eligibility_failed`.
- [x] `Agent Execution Outcome` accepts the canonical seven started-execution outcomes, including `timeout`.
- [x] Invalid execution lifecycle values are rejected and not persisted.
- [x] `Agent Exec Req Fingerprint` stores the exact 71-character canonical fingerprint.
- [x] Environment numeric-ID binding is complete and unambiguous for the current target Issue.
- [x] Writer credential can write synthetic non-secret rejection values.
- [x] Rejection values can be read back exactly without allocating `execution_id`.
- [x] One combined synthetic `Agent Running` mutation persists the required pre-start execution facts.
- [x] Agent Running start facts can be read back exactly.
- [x] Finish / outcome / artifact fields can remain empty at execution start.
- [x] Redmine journal records the synthetic field-change mutations.
- [x] v0.3.0 approval fields and `release_tag` are not reused as execution storage.
- [x] Ordinary Redmine Issue Status remains independent from execution lifecycle.
- [x] All synthetic test values were cleared and final read-back confirmed cleanup.

## Completion rule

The current environment satisfies the Phase 46-5 provisioning and writer /
read-back verification requirements. #5400 may be closed only after the revised
canonical contract and this verification record are merged and the ticket-level
completion review confirms the remaining Phase 46-5 criteria.
