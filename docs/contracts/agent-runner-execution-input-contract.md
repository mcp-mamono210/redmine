# Agent Runner Execution Input Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 46 contract for the execution input boundary
between the existing `Ready for Agent` handoff and later Agent Runner execution.

Phase 46-1 established the initial contract for:

- base execution eligibility;
- exact approved Agent Brief recovery;
- immutable handoff identity validation;
- repository identity resolution; and
- fail-closed behavior before later execution-specific checks.

Phase 46-2 extended the same canonical contract with:

- execution-time requirements revalidation using the existing v0.3.0
  requirements-fingerprint semantics;
- `stale_requirements` / `eligibility_failed` pre-execution routing;
- the distinction between a pre-execution rejection and an execution attempt;
- the durable logical facts required to record a rejection without an
  `execution_id`; and
- the responsibility boundary for any future Phase 47-specific outcome
  extension.

Phase 46-3 established on the same canonical contract:

- exact Application Git source-revision semantics;
- immutable source identity as repository plus exact commit;
- execution identity and traceability semantics;
- the `execution_id` allocation boundary after the Phase 47 authorization /
  security gate; and
- explicit deferral of concrete `execution_id` serialization to Phase 46-5.

Phase 46-4 established on the same canonical contract:

- the reserved Phase 47 authorization / security gate position after exact
  source resolution and before `execution_id` allocation;
- an immutable execution-input snapshot whose identity cannot be reinterpreted
  from later mutable state;
- the logical execution record and lifecycle-stage semantics for its fields;
- separation between pre-execution rejection facts and started-execution
  records; and
- the durable `Agent Running` mutation boundary that must succeed before Agent
  start.

Phase 46-5 extended the same canonical contract with:

- a verified current-environment Redmine capability inventory;
- physical mappings for pre-execution rejection and started execution records;
- a portable name / type / constraint mapping separated from environment-specific
  numeric custom-field IDs;
- the manually provisioned execution-field set and post-provisioning writer /
  read-back evidence; and
- concrete `execution_id` serialization compatible with the verified storage
  constraints.

Phase 46-6 finalizes this contract by verifying compatibility with the v0.3.0 handoff,
Phase 45 architecture / lifecycle ownership, the Phase 47-50 responsibility
boundary, and the current v0.4.0 roadmap.

This contract is subordinate to the Phase 45 architecture / lifecycle boundary:

```text
docs/contracts/agent-runner-execution-boundary-contract.md
```

The upstream v0.3.0 handoff meaning remains authoritative in:

```text
docs/contracts/agent-brief-release-handoff-contract.md
```

Phase 46 consumes those contracts. It does not redefine `Ready for Agent`, Human
Review, Handler Validation, approval metadata, Brief persistence identity, or
requirements-fingerprint semantics.

The completed Phase 46 contract does not implement Agent execution. It fixes the
execution-input, identity, persistence, and start-mutation boundaries, but it
does not implement Git checkout, Phase 47 authorization policy, credentials,
sandboxing, Controller / Worker runtime behavior, Agent process invocation,
artifact persistence, or deterministic execution E2E.

## Execution Eligibility

A candidate is eligible to continue beyond the Phase 46-1 handoff-validation
boundary only when all of the following conditions are established:

```text
Agent Brief lifecycle == Ready for Agent

approval metadata is complete and syntactically valid

approved Brief revision is valid

approved persisted revision is valid

repository identity resolves unambiguously

exact approved Brief is retrievable

stored Brief identity agrees with the approved handoff identity

stored Brief requirements fingerprint agrees with approved metadata
```

`Ready for Agent` above means the logical Agent Brief lifecycle defined by the
existing v0.3.0 lifecycle / Redmine mapping contracts. It does not mean the
ordinary Redmine Issue Status has been renamed or overloaded with that value.

The complete approval record is the existing five-value approval fact:

```text
approver_identity
approved_at
approved_brief_revision
approved_persisted_revision
approved_requirements_fingerprint
```

Phase 46-1 validates that those values are present, syntactically valid, and
consistent with the approved artifact. It must not rewrite them to record any
execution-time fact.

This eligibility check intentionally does not assert that current Redmine
requirements are still equal to the approved requirements fingerprint. Current
requirements revalidation is a separate Phase 46-2 responsibility.

Likewise, this phase does not prove that the repository is authorized for Agent
execution. It proves only that the repository identity required by the handoff
can be resolved unambiguously. Repository authorization belongs to Phase 47.

## Requirements Revalidation

A successful Phase 46-1 handoff validation proves that the recovered Brief is
the exact approved artifact. It does not prove that the current Redmine
requirements are still equal to the requirements approved for that artifact.

Before an execution attempt may be established, the later execution boundary
must revalidate requirements by reusing the existing v0.3.0 requirements
selection and fingerprint semantics:

```text
latest Redmine requirements
    |
    v
existing Phase 36 bounded generation-input semantics
    |
    v
existing Phase 39 canonical requirements fingerprint
    |
    v
compare with approved_requirements_fingerprint
```

Phase 46 must not introduce a Runner-specific source selection, canonicalization,
fingerprint algorithm, hash representation, or semantic-equivalence rule. The
existing v0.3.0 fingerprint contract remains authoritative for what is included,
what is excluded, deterministic serialization, and SHA-256 representation.

The comparison result has these meanings:

```text
current fingerprint == approved_requirements_fingerprint
  -> requirements are current for this approved Brief
  -> later pre-execution gates may continue

current fingerprint != approved_requirements_fingerprint
  -> pre-execution rejection
  -> Agent is not started
  -> lifecycle target = Needs Human
  -> outcome = stale_requirements
```

A fingerprint-generation failure is neither CURRENT nor STALE. If the current
requirements input cannot be established, canonicalized, serialized, hashed, or
otherwise validated under the existing fingerprint contract, the system must
fail closed:

```text
fingerprint generation failure
  -> pre-execution rejection
  -> Agent is not started
  -> lifecycle target = Needs Human
  -> outcome = eligibility_failed
```

The execution boundary must not fall back to `updated_on`,
`source_updated_on`, approval time, Issue modification time, or another
timestamp-only freshness signal. A timestamp mismatch is not the canonical
requirements-staleness test.

Requirements revalidation is read-only with respect to the existing approval
fact. The Controller must not rewrite `approved_requirements_fingerprint`,
`approved_at`, the approved Brief identity, or other approval metadata merely to
make a later execution candidate appear current.

## Pre-execution Rejection

A candidate rejected before an execution attempt is established is a
pre-execution rejection, not a partial execution.

The current v0.4.0 classification is:

```text
requirements fingerprint mismatch
  -> Needs Human
  -> outcome = stale_requirements

approval / handoff validation failure
fingerprint generation failure
exact source revision determination failure
Phase 47 authorization / security gate failure
  -> Needs Human
  -> outcome = eligibility_failed
```

`stale_requirements` is reserved for the case where both canonical fingerprints
were successfully established and their values differ. Failures to establish a
valid fingerprint are not STALE and use `eligibility_failed`.

The exact source-revision mechanism is owned by Phase 46-3, and the exact Phase
47 authorization / security gate ordering is owned by Phase 46-4 / Phase 47.
Phase 46-2 fixes only their pre-execution rejection classification when they
fail before an execution attempt is established.

The Controller must not start the Agent for any pre-execution rejection. It also
must not respond to a rejection by writing approval-side lifecycle states such
as `Brief Draft` or `Brief Ready`, performing Human Review, rerunning approval
semantics, or rewriting approval metadata. The execution-side boundary stops at
`Needs Human`; a later Human / approval workflow decides what happens next.

### Pre-execution rejection record

A pre-execution rejection does not require or imply an `execution_id`. In
particular, it must not require the execution-record-only facts:

```text
execution_id
started_at
finished_at
artifact_reference
```

At the logical contract level, Redmine must be able to retain at least:

```text
issue_id
rejection time
outcome
bounded reason / diagnostic
lifecycle target = Needs Human
```

This durable rejection fact is logically distinct from the execution record for
a started execution. The absence of `execution_id` means no execution attempt
was established; it is not an unknown or empty execution identifier. Phase 46-3
owns the later execution-ID allocation boundary.

Phase 46-2 does not choose the physical Redmine representation for these facts.
Custom fields, journals, environment-specific IDs, and mutation shape remain
Phase 46-5 responsibilities.

### Outcome extension boundary

Phase 47 authorization / security gate failure uses the existing canonical
`eligibility_failed` outcome unless a later explicit contract change says
otherwise.

If Phase 47 needs a new durable outcome identity such as a more specific
authorization or security-policy result, it must not add that identity as an
implicit implementation detail. Phase 47 must explicitly review and update, as
applicable:

```text
Phase 45 canonical execution boundary contract
execution outcome taxonomy
required ADR / architecture decision
```

Until that explicit change occurs, `eligibility_failed` remains the canonical
outcome for Phase 47 gate failure. Phase 46-2 does not redefine the Phase 45
outcome taxonomy.

## Exact Source Revision

Application Git remains the Source of Truth for application source. Phase 46-3
does not copy application source authority into Redmine, versioned Brief
storage, the Runner workspace, or an execution-local database.

Before an execution attempt can receive an `execution_id`, the execution target
must be resolved to an exact immutable Application Git revision. The logical
source identity is:

```text
repository
+
exact commit
```

The exact commit must identify one concrete Git commit object. The contract does
not require a particular Git object hash algorithm or hard-code an object-ID
length, but the stored `source_revision` must be sufficient to re-identify the
same immutable commit later.

A branch, tag, symbolic ref, or `HEAD` may be used as source-selection input, but
it is not by itself the execution source identity. Before the execution identity
is allocated, any such moving reference must be resolved to the exact commit that
will be used by that execution.

The following alone are therefore insufficient as `source_revision`:

```text
main
develop
feature/*
HEAD
mutable branch name
mutable tag name
```

Once the exact commit has been selected for an execution candidate, later
movement of the branch or tag must not silently retarget that candidate. The
immutable execution-input snapshot defined below preserves this identity through
execution.

Exact source revision determination is fail closed. If the repository cannot be
resolved to one exact eligible commit, if the selected ref cannot be resolved,
or if resolution is ambiguous or unavailable, the result is a pre-execution
rejection under the Phase 46-2 contract:

```text
exact source revision determination failure
  -> Agent is not started
  -> lifecycle target = Needs Human
  -> outcome = eligibility_failed
  -> execution_id is not allocated
```

If exact source revision resolution requires repository access, that access must
comply with the Phase 47 repository-access policy. Phase 47 may apply an early
allowlist pre-check after Phase 46 has resolved the repository identity and
before credentialed repository access, solely to prevent access to an
unauthorized repository.

This early pre-check is not the formal Phase 47 authorization / security gate and
does not move that reserved gate ahead of exact source revision resolution. If
the early pre-check fails or authorization cannot be established, repository
access and source resolution stop. The candidate remains an execution-ID-less
pre-execution rejection under the existing Phase 46-2 semantics:

```text
lifecycle target = Needs Human
outcome = eligibility_failed
execution_id = not allocated
Agent Running = not written
Agent = not started
```

The early pre-check must consume the repository identity already established by
Phase 46. It must not redefine or re-normalize that runtime identity. Concrete
repository-access / allowlist policy is owned by Phase 47.

This source-resolution contract does not grant repository authorization. Phase
47 owns repository allowlist, authorization, credentials, and security policy.
Phase 46-3 requires only that the execution source has already been reduced to an
unambiguous repository identity plus exact commit before the Phase 47 gate is
passed and before an execution ID is allocated.

## Execution Identity

`execution_id` identifies one concrete execution attempt. It is not an Issue
identity, Brief identity, source revision, retry counter, lifecycle state, or
artifact identifier.

Each execution attempt must be traceable to at least the following logical
identity set:

```text
execution_id
issue_id
repository
source_revision
brief_revision
persisted_revision
requirements_fingerprint
```

Together these values make it possible to establish which Redmine Issue, exact
approved Brief, approved requirements proof, repository, and exact Application
Git source revision belong to one execution attempt.

Multiple execution attempts for the same Issue are permitted, but each attempt
must receive a distinct `execution_id`. Reusing one `execution_id` for a later
retry or a different source / Brief identity is forbidden. Once allocated, the
identifier is stable for that attempt and must not be rewritten to encode a
later lifecycle result.

The execution identifier must also be non-secret. It must not contain API keys,
credentials, access tokens, secret repository URLs, or other secret-bearing
material.

### Execution ID allocation boundary

The allocation ordering is:

```text
Phase 46 handoff / eligibility validation passed
    |
    v
requirements are current
    |
    v
exact source revision fixed
    |
    v
Phase 47 authorization / security gate passed
    |
    v
execution preparation entered
    |
    v
execution_id allocated
```

Phase 46-3 fixed the ordering relationship that `execution_id` allocation is
after successful Phase 47 authorization / security gating. Phase 46-4 completes
the full ordering below around snapshot construction, logical execution-record
preparation, durable `Agent Running` mutation, and Agent start. Phase 47 owns the
actual authorization / security rules.

Accordingly, all pre-execution rejections that occur before this allocation
boundary remain execution-ID-less rejections. This includes at least:

```text
approval / handoff validation failure
fingerprint generation failure
stale requirements
exact source revision determination failure
Phase 47 authorization / security gate failure
```

The absence of an `execution_id` for these cases means that no execution attempt
identity was established. It must not be represented as an empty, pending,
unknown, or placeholder execution ID.

The existence of an `execution_id` therefore establishes the following minimum
invariant:

```text
Phase 46 pre-execution validation passed
+
requirements current
+
exact source revision fixed
+
Phase 47 authorization / security gate passed
+
execution preparation entered
```

It does not by itself mean that `Agent Running` has been durably written or that
the Agent has started. Those boundaries are Phase 46-4 responsibilities.

### Execution ID serialization boundary

Phase 46-3 fixes only the semantic requirements for `execution_id`:

```text
unique per execution attempt
stable for that attempt
execution-attempt scoped
non-secret
traceable to Issue / Brief / source identity
```

It deliberately does not fix:

```text
string format
length
character set
prefix
encoding
Redmine field representation
```

Those physical serialization properties are Phase 46-5 responsibilities after
the actual Redmine storage capabilities and constraints are inventoried. Phase
46-3 must not choose a serialization that later forces an imaginary or
environment-specific Redmine field contract.

## Phase 47 Authorization / Security Gate Reservation

Phase 46 reserves one mandatory Phase 47 authorization / security gate in the
pre-start ordering. Its position is fixed even though the concrete authorization
rules remain a Phase 47 responsibility.

The final ordering through Agent start is:

```text
Phase 46 handoff / eligibility validation passed
    |
    v
requirements are current
    |
    v
exact source revision fixed
    |
    v
[ Phase 47 authorization / security gate ]
    |
    v
execution preparation entered
    |
    v
execution_id allocated
    |
    v
immutable execution input snapshot established
    |
    v
required logical execution record prepared
    |
    v
durable Redmine mutation: Agent Running + start facts
    |
    v
Agent start
```

The Phase 47 gate consumes the already established repository identity and exact
source revision. It must not authorize a mutable branch name and then allow the
execution target to be re-resolved after the gate.

A Phase 47 gate failure or an inability to establish a successful gate result is
a pre-execution rejection under the existing Phase 46-2 contract:

```text
Phase 47 gate failed or result unknown
  -> execution_id is not allocated
  -> execution attempt is not established
  -> Agent Running is not written
  -> Agent is not started
  -> lifecycle target = Needs Human
  -> outcome = eligibility_failed
```

`unknown` is not authorization success. Phase 46-4 does not define repository
allowlists, credential policy, security policy, or another Phase 47 rule.

This gate position preserves the Phase 46-3 invariant that an existing
`execution_id` means Phase 46 pre-execution validation passed, current
requirements were established, exact source revision was fixed, the Phase 47
gate passed, and execution preparation was entered.

## Execution Input Snapshot

After the Phase 47 gate succeeds and `execution_id` is allocated, the execution
input identity must be materialized as one immutable logical snapshot before the
`Agent Running` mutation.

The snapshot contains at least:

```text
execution_id
issue_id
repository
source_revision
brief_revision
persisted_revision
requirements_fingerprint
approved Brief reference
```

The `approved Brief reference` is the immutable handoff reference required to
recover the exact approved Brief. Phase 46-4 does not create a mutable pointer or
new "current Brief" alias for that purpose.

These fields bind one execution attempt to one Issue, one approved Brief, one
approved requirements proof, and one exact Application Git source revision. The
snapshot identity is fixed for the lifetime of that execution attempt.

Execution start must not cause the Controller, Worker, or Agent integration to
re-fetch mutable state and reinterpret the snapshot identity. In particular, a
running or later-completed execution must not change its identity by:

```text
selecting the latest Brief
selecting a newer Brief revision
changing persisted_revision
replacing the approved requirements fingerprint
re-resolving a branch or HEAD to a newer source_revision
substituting a different repository identity
```

Redmine requirements, approval fields, Brief storage, branches, tags, and `HEAD`
may change after the snapshot is established. Those later mutations may affect a
future execution candidate, but they do not retarget the existing execution.

A later component may re-read mutable state for diagnostics, verification, or a
new workflow decision, but such a read must not overwrite the identity of the
existing execution snapshot.

## Logical Execution Record

An execution attempt that crosses the `execution_id` allocation boundary has one
logical execution record distinct from the durable pre-execution rejection fact
defined by Phase 46-2. The execution record contains at least:

```text
execution_id
issue_id
brief_revision
persisted_revision
requirements_fingerprint
repository
source_revision
started_at
finished_at
outcome
artifact_reference
```

The execution record is a logical schema in Phase 46-4. Phase 46-5 owns the
physical Redmine fields, names, types, constraints, environment-specific numeric
ID binding, and provisioning required to persist it.

### Field lifecycle

The minimum lifecycle-stage meaning is:

| Field | Required meaning |
| --- | --- |
| `execution_id` | Allocated after the Phase 47 gate succeeds and stable for the attempt. |
| `issue_id` | Fixed before `Agent Running`; identifies the Redmine Issue for the attempt. |
| `brief_revision` | Fixed before `Agent Running`; identifies the approved Brief revision. |
| `persisted_revision` | Fixed before `Agent Running`; identifies the exact approved Brief bytes. |
| `requirements_fingerprint` | Fixed before `Agent Running`; identifies the approved requirements proof revalidated as current. |
| `repository` | Fixed before `Agent Running`; identifies the Application Git repository. |
| `source_revision` | Fixed before `Agent Running`; identifies the exact immutable source commit. |
| `started_at` | Set durably as part of the successful transition into `Agent Running`, before Agent process start. |
| `finished_at` | Pending while execution is active; set when the execution reaches its completion / failure boundary. |
| `outcome` | Pending while execution is active; set to the canonical execution outcome when one is established. |
| `artifact_reference` | Pending until the Phase 49 artifact-persistence boundary establishes its final value or later contract determines that no reference exists. |

`started_at` records entry into the durable execution-running lifecycle. It does
not assert that the Agent process itself started successfully; this distinction
permits the existing `agent_start_failed` outcome without moving Agent start
before the durable `Agent Running` boundary.

### Absent / pending / empty

The logical record must distinguish these states rather than collapsing them
into an empty string or null-like convention:

```text
absent
  = no value has been established and, at the current lifecycle point, the
    contract does not claim that a value exists

pending
  = the logical field applies to this execution and is expected to be
    established by a later lifecycle boundary, but is not established yet

empty
  = a value is explicitly present but contains no semantic payload
```

An empty value is not a substitute for an absent or pending required identity,
time, outcome, or reference. Whether any particular field may validly use an
explicit empty value is owned by the later contract that owns that field's
concrete semantics; Phase 46-4 does not silently treat blank text as success.

### Pre-execution rejection separation

A pre-execution rejection remains a durable rejection fact, not an execution
record with blank execution fields. The system must not create an empty
execution record solely so that a rejected candidate appears to have:

```text
execution_id = empty
started_at = empty
finished_at = empty
artifact_reference = empty
```

Candidates rejected before `execution_id` allocation retain the Phase 46-2
rejection representation and do not become started execution attempts.

## Agent Running Durable Mutation Boundary

Agent start is permitted only after the execution identity, immutable snapshot,
and required pre-start execution-record facts are ready to be made durable in
Redmine and the `Agent Running` lifecycle mutation succeeds.

The boundary is:

```text
Phase 46 / Phase 47 pre-execution gates passed
    |
    v
execution_id allocated
    |
    v
immutable execution input snapshot established
    |
    v
pre-start execution record facts prepared
    |
    v
Redmine durable mutation succeeds
  - execution identity / pre-start record facts durable
  - started_at durable
  - lifecycle target = Agent Running
    |
    v
Agent start permitted
```

At minimum, the identity-bearing record facts that must already be fixed before
Agent start are:

```text
execution_id
issue_id
repository
source_revision
brief_revision
persisted_revision
requirements_fingerprint
started_at
```

The approved Brief reference is also fixed in the immutable execution input
snapshot before Agent start. Phase 46-5 determines how these logical facts map
to actual Redmine persistence capabilities.

If the required Redmine mutation fails, is rejected, or its successful durable
completion cannot be established, the Agent must not start. `unknown` mutation
result is not permission to execute.

This mutation-failure case occurs after `execution_id` allocation and therefore
must not be misrepresented as a Phase 46-2 pre-execution rejection that never
received an execution identity. Phase 46-4 fixes only the no-Agent-start safety
boundary here; later implementation / recovery phases own concrete recovery and
diagnostic behavior consistent with the Phase 45 outcome taxonomy.

Phase 46-4 does not define the physical Redmine mutation shape, custom-field IDs,
field provisioning, Controller transaction implementation, Worker behavior, or
Agent invocation mechanism.

## Redmine Capability / Physical Mapping

Phase 46-5 maps the Phase 46 logical rejection and execution-record facts onto
capabilities that are actually available in the current Redmine environment.
The mapping is intentionally split into a portable canonical definition and an
environment-specific numeric-ID binding.

### Verified current-environment capability inventory

Inspection and post-provisioning verification on 2026-09-13 established the
following current facts for the target scope used by Phase 46:

```text
project: Redmine
observed project id: 414
tracker: 機能
observed tracker id: 2
verification Issue: #5402
```

The numeric project / tracker IDs and custom-field IDs below are environment
observations, not portable protocol constants.

| Capability | Current observation | Phase 46-5 consequence |
| --- | --- | --- |
| Issue custom fields | all fourteen execution / rejection fields are visible on target Issues after manual provisioning | the required physical mapping is available in the current target scope |
| custom-field name constraint | Redmine rejected names longer than 30 characters during provisioning | canonical execution field names use the verified <=30-character names defined below |
| requirements fingerprint storage | `Agent Exec Req Fingerprint` accepts and reads back the exact 71-character `sha256:` + 64 lowercase hex representation | the Phase 39 fingerprint representation fits the provisioned execution storage without truncation |
| global custom-field inventory | administrative custom-field listing returns HTTP `403` for the current integration credential | runtime and verification must not depend on global admin enumeration or guessed IDs |
| ordinary Issue Status | current allowed workflow exposes `新規`, `進行中`, `解決`, `フィードバック`, `終了`; execution lifecycle values are not ordinary Issue Status values | execution lifecycle is represented by a dedicated custom field, not by overloading ordinary Issue Status |
| journal read capability | Issue journals and field-change details are readable and #5402 recorded the synthetic verification mutations | Redmine journal remains durable audit history for execution-field changes |
| Issue writer capability | guarded writer updates the provisioned execution fields and exact values are readable afterward | the required rejection and execution start mutation shapes are representable |
| list validation | canonical lifecycle / rejection / execution outcome values were accepted; an invalid lifecycle value was rejected with HTTP `422` | list fields enforce the configured canonical value set |
| logical execution mutation | one combined synthetic `Agent Running` start mutation, including execution identity, exact source, 71-character fingerprint, and `started_at`, was written and read back successfully | the pre-Agent durable mutation boundary required by Phase 46-4 is available |
| cleanup | #5402 execution / rejection test values were cleared and read back as empty after verification | the disposable verification path does not leave synthetic execution state active |

The capability inventory is deliberately based on observable target-Issue and
writer behavior. The canonical contract must not assume that a Redmine
administrator endpoint is available to the Runner credential.

The current environment is aligned for the Phase 46-5 physical mapping. The
verified provisioning / writer record is documented in:

```text
docs/contracts/agent-runner-redmine-execution-provisioning.md
```

### Representation decision

Ordinary Redmine Issue Status remains the ordinary ticket workflow. It is not
renamed or expanded solely to represent Agent Runner lifecycle state.

Execution-side lifecycle is stored in a dedicated Issue custom field:

```text
Agent Execution Lifecycle
```

Its allowed values are exactly:

```text
Agent Running
Ready for Independent Verification
Needs Human
```

This field is distinct from the v0.3.0 `Agent Brief Lifecycle` field. The
Approval Handler continues to own `Brief Draft`, `Brief Ready`, and
`Ready for Agent`; the Agent Controller owns the three execution-side values
above. Neither writer may reuse the other lifecycle field as a shortcut.

The physical representation is a current durable Issue projection plus Redmine
journal history. The Issue fields represent the current execution/rejection
projection. Redmine's journal preserves prior field mutations so a later attempt
does not require a Runner database to become the durable history authority.

### Pre-execution rejection physical mapping

A pre-execution rejection remains execution-ID-less. Its portable physical
mapping is:

| Logical fact | Redmine storage | Field type | Constraint |
| --- | --- | --- | --- |
| `issue_id` | native Redmine Issue ID | native integer | positive Issue ID; no duplicate custom field |
| rejection time | `Agent Rejection At` | string | RFC 3339 timestamp with timezone/offset; maximum 64 characters |
| outcome | `Agent Rejection Outcome` | single-value list | exactly `stale_requirements` or `eligibility_failed` |
| bounded reason / diagnostic | `Agent Rejection Diagnostic` | text | maximum 2048 characters after redaction; must not contain credentials or secret values |
| lifecycle target | `Agent Execution Lifecycle` | single-value list | exactly `Needs Human` for a pre-execution rejection |

A rejection write must not allocate or fabricate:

```text
execution_id
started_at
finished_at
artifact_reference
```

The rejection fields are separate from the started-execution fields below. A
rejection therefore does not create an empty execution record and does not
attach a new rejection outcome to a previous execution ID.

### Started execution record physical mapping

The portable mapping for one started execution attempt is:

| Logical fact | Redmine storage | Field type | Constraint |
| --- | --- | --- | --- |
| `issue_id` | native Redmine Issue ID | native integer | positive Issue ID; no duplicate custom field |
| `execution_id` | `Agent Execution ID` | string | canonical lowercase UUIDv4, exactly 36 characters |
| `brief_revision` | `Agent Exec Brief Revision` | integer | positive base-10 integer |
| `persisted_revision` | `Agent Exec Persisted Revision` | text | non-empty opaque persisted-revision identifier; maximum 1024 characters |
| `requirements_fingerprint` | `Agent Exec Req Fingerprint` | string | lowercase `sha256:` plus 64 lowercase hexadecimal characters |
| `repository` | `Agent Execution Repository` | string | canonical non-secret repository identity; maximum 255 characters; credential-bearing URLs forbidden |
| `source_revision` | `Agent Exec Source Revision` | string | full non-abbreviated lowercase hexadecimal Git object ID; maximum 128 characters; no hash-algorithm length assumption |
| `started_at` | `Agent Execution Started At` | string | RFC 3339 timestamp with timezone/offset; maximum 64 characters |
| `finished_at` | `Agent Execution Finished At` | string | empty while pending; otherwise RFC 3339 timestamp with timezone/offset, maximum 64 characters |
| `outcome` | `Agent Execution Outcome` | single-value list | empty while pending; otherwise one started-execution outcome from the canonical taxonomy below |
| `artifact_reference` | `Agent Artifact Reference` | text | empty while pending; otherwise non-secret opaque durable artifact reference, maximum 2048 characters; signed URLs/tokens forbidden |

The allowed started-execution outcomes are exactly:

```text
changes_ready
no_changes
interrupted
timeout
agent_start_failed
agent_failed
artifact_persistence_failed
```

The pre-execution outcomes `stale_requirements` and `eligibility_failed` are not
stored in `Agent Execution Outcome`; they belong to `Agent Rejection Outcome`.
This separation prevents an execution-ID-less rejection from being interpreted
as the outcome of an older started attempt.

The approved Brief reference does not require an additional Redmine field. It
is reconstructible from the already-durable execution identity tuple:

```text
repository
issue_id
brief_revision
persisted_revision
```

The physical mapping does not reuse any v0.3.0 approval metadata field as
execution storage. In particular, the execution projection must not rewrite or
repurpose:

```text
Agent Brief Lifecycle
Brief Approved By
Brief Approved At
Approved Brief Revision
Approved Persisted Revision
Approved Req Fingerprint
```

### Field lifecycle and journal history

The custom fields above are a current durable projection, not a second Runner
ledger. Every mutation remains a Redmine mutation and Redmine remains the only
durable execution-lifecycle Source of Truth.

A later attempt may replace the current projection only through the defined
lifecycle boundary. Redmine journal history must remain enabled so prior field
values and transitions remain auditable. An implementation must not delete or
rewrite Redmine journal history to make a new attempt appear to be the first
attempt.

Before a new started execution is written, stale rejection projection fields may
be cleared as part of the same durable start mutation. Before a new
pre-execution rejection is written, existing started-execution fields need not
be fabricated, cleared, or converted into an empty execution record. The active
interpretation is selected by `Agent Execution Lifecycle` plus the distinct
rejection / execution field sets.

## Environment Binding Boundary

The canonical mapping is the exact field name, field type, and constraint table
above. Numeric custom-field IDs are environment-specific deployment data and are
not canonical constants.

Each Runner environment must provide one complete one-to-one binding:

```text
canonical field name
  -> positive numeric Redmine custom-field ID in that environment
```

The current Redmine environment was observed on 2026-09-13 with IDs `11` through
`24` for the fourteen canonical execution / rejection fields. That table is an
environment verification record only and is kept in the provisioning document;
it is not a portable application constant.

A real binding is accepted only after the target Issue exposes each canonical
field name exactly once and the observed numeric ID is recorded in that
environment's deployment configuration. Test and production Redmine instances
may assign different numeric IDs to the same canonical names.

The implementation must not require ID equality across environments and must
fail closed if a binding is missing, non-positive, duplicated, or resolves to
the wrong canonical field name.

The concrete serialization format of the deployment configuration is a Runner
implementation responsibility. Phase 46-5 fixes the binding semantics, not a
particular secret manager, environment-variable name, or config-file path.

## Provisioning Record

The current environment was manually provisioned with the following Issue
custom fields. This list is part of the Phase 46-5 environment-alignment record;
provisioning automation remains out of scope.

| Exact field name | Type | Purpose | Required constraint |
| --- | --- | --- | --- |
| `Agent Execution Lifecycle` | single-value list | durable execution lifecycle | values exactly `Agent Running`, `Ready for Independent Verification`, `Needs Human`; not globally required |
| `Agent Rejection At` | string | durable pre-execution rejection timestamp | RFC 3339 with timezone/offset; max 64; not globally required |
| `Agent Rejection Outcome` | single-value list | durable pre-execution outcome | values exactly `stale_requirements`, `eligibility_failed`; not globally required |
| `Agent Rejection Diagnostic` | text | bounded rejection reason | app limit 2048 chars after redaction; not globally required |
| `Agent Execution ID` | string | started-attempt identity | exactly 36-char lowercase UUIDv4; not globally required |
| `Agent Exec Brief Revision` | integer | approved Brief revision used by execution | positive integer; not globally required |
| `Agent Exec Persisted Revision` | text | exact persisted Brief identity | non-empty, app limit 1024; not globally required |
| `Agent Exec Req Fingerprint` | string | approved requirements proof used by execution | exact 71-char lowercase `sha256:` + 64 hex; not globally required |
| `Agent Execution Repository` | string | canonical repository identity | max 255; non-secret; no credential-bearing URL; not globally required |
| `Agent Exec Source Revision` | string | exact Application Git commit | full non-abbreviated lowercase hexadecimal Git object ID; max 128; no hash-algorithm length assumption; not globally required |
| `Agent Execution Started At` | string | durable execution start time | RFC 3339 with timezone/offset; max 64; not globally required |
| `Agent Execution Finished At` | string | durable execution finish time | empty while pending or RFC 3339; max 64; not globally required |
| `Agent Execution Outcome` | single-value list | outcome of a started execution | canonical seven started-execution outcomes; empty while pending; not globally required |
| `Agent Artifact Reference` | text | durable Phase 49 artifact reference | empty while pending; app limit 2048; non-secret; signed URL/token forbidden; not globally required |

All fourteen fields are applicable to the configured Agent Runner project /
tracker scope (`Redmine` / `機能`) and were visible on verification Issue #5402.
The shortened `Agent Exec ...` names are intentional because the current Redmine
environment enforces a 30-character custom-field name limit.

### Post-provisioning capability re-check

#5402 completed the required synthetic writer / read-back verification without
starting an Agent. The verification established all of the following:

1. target Issue #5402 exposed all fourteen canonical field names exactly once;
2. the current environment binding resolved those names to distinct positive
   numeric IDs;
3. `Needs Human` + `eligibility_failed` rejection facts were written and read
   back with no `execution_id`;
4. a combined `Agent Running` mutation persisted `execution_id`, Brief identity,
   the exact 71-character requirements fingerprint, repository, exact source
   revision, and `started_at`;
5. `finished_at`, execution `outcome`, and `artifact_reference` remained empty at
   execution start;
6. canonical lifecycle / rejection / execution-outcome list values were
   accepted, including `timeout`;
7. an invalid execution lifecycle value was rejected with HTTP `422` and was not
   persisted;
8. Redmine journal history recorded the synthetic field changes;
9. `release_tag` and v0.3.0 approval metadata were not repurposed as execution
   storage; and
10. all synthetic execution / rejection values were cleared and read back as
    empty at the end of the verification.

The administrative global custom-field inventory endpoint remains unavailable
(`403`) to the integration credential. This is acceptable because runtime and
verification resolve the mapping from the target Issue and fail closed when a
required exact-name field is missing or ambiguous.

## Execution ID Serialization

The concrete v0.4.0 `execution_id` representation is a canonical lowercase
hyphenated UUID version 4 string:

```text
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

where `x` is lowercase hexadecimal and `y` is one of `8`, `9`, `a`, or `b`.
The exact validation expression is:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

Properties:

```text
length: 36 characters
character set: lowercase hexadecimal + hyphen
scope: one started execution attempt
allocation: only after successful Phase 47 gate
stability: immutable for the lifetime of that attempt
secret content: forbidden
reuse across retries / attempts: forbidden
```

This serialization fits the provisioned `Agent Execution ID` string constraint
without relying on an environment-specific numeric custom-field ID. The runtime
must still detect accidental reuse within the durable Redmine history; UUID
format alone is not permission to reuse an existing execution identity.

## Agent Running Writer Capability

The physical start mutation must be representable as one authorized Redmine
Issue update containing at least:

```text
Agent Execution Lifecycle = Agent Running
Agent Execution ID
Agent Exec Brief Revision
Agent Exec Persisted Revision
Agent Exec Req Fingerprint
Agent Execution Repository
Agent Exec Source Revision
Agent Execution Started At
```

The update may also clear stale rejection-projection fields for the new attempt.
`finished_at`, execution `outcome`, and `artifact_reference` remain empty/pending
at Agent start.

A successful HTTP/API response is necessary but not sufficient for production
readiness. The post-provisioning re-check must read the Issue back and establish
that the intended exact-name fields contain the intended values. A failed,
rejected, partial, ambiguous, or unverified mutation result does not permit
Agent start.

The existing Redmine Write Guard / allowed-project boundary remains mandatory.
Phase 46-5 does not create a generic unguarded custom-field writer or a second
credential path.

Redmine remains the only durable Source of Truth for execution lifecycle and the
current execution projection. Agent Runner may hold transient in-memory values
while preparing a mutation, but a local file, Workspace, lock, or Runner-local
database must not become a second durable execution-state authority.

## Approved Brief Recovery

The exact approved Brief must be recovered through the existing immutable
handoff identity and approval evidence.

The immutable artifact identity is:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

The associated approval evidence is:

```text
requirements_fingerprint
approver_identity
approved_at
```

The logical recovery sequence is:

```text
read the current Redmine Issue
    |
    v
require Agent Brief lifecycle == Ready for Agent
    |
    v
require complete valid approval metadata
    |
    v
resolve the configured repository identity unambiguously
    |
    v
derive the exact approved Brief identity
    |
    v
read the exact brief_revision from versioned Brief storage
    |
    v
verify persisted_revision identifies the returned stored artifact
    |
    v
verify stored Issue / repository / revision identity
    |
    v
verify stored Brief requirements fingerprint agrees with approval metadata
    |
    v
approved Brief recovery established
```

`persisted_revision` remains the opaque immutable storage identity defined by the
v0.3.0 persistence contract. Phase 46 must not assume a Git hash algorithm,
commit-SHA representation, or fixed object-ID length for that value.

Recovery is exact-artifact recovery. A consumer must not substitute or infer an
artifact from any mutable convenience reference, including:

```text
latest Brief
latest revision
current file
current.md
latest.md
mutable branch
branch HEAD
```

The numerically newest Brief revision is not automatically the approved Brief.
The approved `brief_revision` and `persisted_revision` from the durable approval
fact select the artifact to recover.

## Handoff Identity Validation

The recovered artifact is valid for this handoff only when the same logical
identity is preserved across Redmine approval metadata, configured repository
identity, and versioned Brief storage.

At minimum, validation must establish all of the following:

1. the Redmine Issue supplying the handoff is the same `redmine_issue_id` stored
   in the recovered Brief;
2. the configured repository identity resolves exactly once and matches the
   recovered Brief `repository` identity;
3. the approved Brief revision equals the recovered Brief revision;
4. the approved persisted revision identifies the exact recovered stored
   artifact;
5. the recovered Brief requirements fingerprint agrees with
   `approved_requirements_fingerprint`;
6. the complete approval record remains internally consistent with the same
   approved artifact; and
7. the lifecycle remains exactly `Ready for Agent` while this handoff validation
   is evaluated.

The repository must not be guessed from a display name, arbitrary filesystem
path, unrelated Redmine field, or mutable branch name.

The approval evidence is read-only execution input. Phase 46-1 must not replace:

```text
approver_identity
approved_at
approved_brief_revision
approved_persisted_revision
approved_requirements_fingerprint
```

with Agent claim time, Agent start time, retry time, Worker identity, current
branch state, or another runtime fact.

Human Review and Handler Validation remain completed upstream responsibilities.
Phase 46-1 validates their durable result; it does not perform either operation
again and does not redefine their semantics.

## Repository Responsibility Boundary

Phase 46-1 owns repository identity resolution only.

Its responsibility is to establish:

```text
repository identity is present
+
repository identity is canonical for the handoff
+
repository identity resolves unambiguously
+
repository identity agrees with the stored Brief
```

The following are Phase 47 security responsibilities and are not defined by
Phase 46-1:

```text
repository allowlist
repository authorization policy
credential authorization
checkout credential policy
sandbox / filesystem policy
network policy
```

Repository identity resolution does not grant execution permission.

A later execution attempt must also pass the Phase 47 authorization / security
gate before the execution attempt is established. Phase 46-1 fixes that
prerequisite only. Later Phase 46 sections define the detailed ordering around
exact source revision, execution identity allocation, execution snapshot, and
`Agent Running` mutation.

## Fail-closed Boundary

Phase 46-1 uses fail-closed eligibility semantics:

```text
unknown
!=
valid
```

The candidate must not continue beyond this boundary when any required fact is
missing, ambiguous, malformed, unavailable, or inconsistent.

At minimum, the following conditions fail closed:

```text
lifecycle is not Ready for Agent
lifecycle cannot be established
approval metadata is incomplete
approval metadata is syntactically invalid
repository identity is missing
repository identity is ambiguous
exact approved Brief cannot be retrieved
brief_revision does not match
persisted_revision does not match
stored Issue identity does not match
stored repository identity does not match
stored requirements fingerprint does not match approved metadata
```

A failure must not be repaired by selecting another Brief revision, another
repository, a mutable `latest` artifact, a different persisted revision, or a
fallback freshness signal.

Phase 46-2 defines the logical pre-execution rejection semantics and routing for
these failures. A failed or unknown check is not execution permission and must
not be treated as a successful handoff to an Agent execution attempt. The
physical Redmine representation of the rejection remains a Phase 46-5
responsibility.

Diagnostics produced by an implementation of this boundary must not contain
credentials, API keys, repository secrets, or other configured secret values.

## Approval Contract Preservation

Phase 46-1 is a consumer of the existing approval fact.

It must preserve all of the following upstream meanings:

- Human Review and Handler Validation are separate responsibilities;
- `Brief Ready` is not execution permission;
- `Ready for Agent` is the approved handoff state;
- approval metadata identifies the existing human approval fact;
- `approved_at` remains the human approval timestamp;
- `approver_identity` remains the persisted approver identity;
- `approved_brief_revision` and `approved_persisted_revision` identify the exact
  approved artifact; and
- `approved_requirements_fingerprint` remains the requirements proof recorded at
  approval / reconciliation time.

Phase 46-1 must not create a second approval interpretation or write surface.

## Phase 45 Compatibility

Phase 46 is a refinement of the Phase 45 execution boundary, not a replacement
for it. The following Phase 45 facts remain authoritative and unchanged:

```text
Redmine
  = the only durable Source of Truth for execution lifecycle and current
    execution-state projection

Approval Handler
  = approval lifecycle writer through Ready for Agent

Agent Controller
  = execution lifecycle writer after a valid Ready for Agent handoff

Application Git
  = application source Source of Truth

private S3
  = durable change-artifact Source of Truth

Phase 45 execution outcome taxonomy
  = changes_ready / no_changes / stale_requirements / eligibility_failed /
    interrupted / timeout / agent_start_failed / agent_failed /
    artifact_persistence_failed
```

Phase 46 does not redefine Human Review, Handler Validation, the meaning of
`Ready for Agent`, approval metadata, requirements-fingerprint semantics, or the
Phase 45 lifecycle write sets. Approval metadata remains approval evidence and is
not reused as execution storage.

The final pre-start ordering is:

```text
Ready for Agent candidate
    |
    v
Phase 46 handoff / eligibility validation
    |
    v
requirements current
    |
    v
exact source revision fixed
    |
    v
Phase 47 authorization / security gate
    |
    v
execution preparation entered
    |
    v
execution_id allocated
    |
    v
immutable execution input snapshot established
    |
    v
required logical execution record prepared
    |
    v
durable Redmine mutation: Agent Running + start facts
    |
    v
Agent start
```

The Phase 47 gate is therefore before `execution_id` allocation and before an
execution attempt is established. A failed or unknown gate result remains an
execution-ID-less pre-execution rejection with:

```text
lifecycle target = Needs Human
outcome = eligibility_failed
```

A new durable Phase 47-specific outcome identity must not be introduced locally.
If one becomes necessary, Phase 47 must explicitly review and update the Phase
45 canonical taxonomy / contract and any architecture decision that becomes
necessary.

The `Agent Running` mutation remains the durable start boundary. The Agent must
not start when that mutation fails, is rejected, is only partially represented,
or cannot be verified by read-back.

## Phase 47-50 Responsibility Boundary

Phase 46 completes the execution-input architecture needed by the downstream
phases. Those phases consume this contract and must not silently redefine its
identity, ordering, or ownership semantics.

### Phase 47

Phase 47 owns the concrete authorization and security rules applied at the
reserved gate, including repository authorization / allowlist policy, credential
isolation, sandbox boundaries, network policy, resource / timeout policy, and
secret-handling requirements.

Phase 47 consumes the already fixed repository identity and exact source
revision. It must not authorize a mutable branch and then re-resolve the source
after the gate. Gate failure or an unknown result remains pre-execution and does
not allocate `execution_id`.

### Phase 48

Phase 48 owns the one-shot runtime implementation: local duplicate prevention,
Workspace / container lifecycle, checkout of the already selected exact source,
Agent Adapter integration, one-shot execution, cleanup, and startup
reconciliation.

Phase 48 must preserve this ordering and identity contract. In particular, it
must not move Agent start before the durable `Agent Running` mutation, replace
the immutable snapshot with later mutable Redmine / Git state, or use the local
lock as a durable execution Source of Truth.

### Phase 49

Phase 49 owns the durable change-artifact contract and persistence boundary,
including manifest, patch, checksum, `no_changes`, private S3 persistence,
artifact reference, and independent-verification recovery.

The artifact may embed the Phase 46 execution identity, but it must not become a
second execution-lifecycle authority or redefine which Brief, requirements proof,
repository, or source revision the execution used.

### Phase 50

Phase 50 owns deterministic Integration / E2E verification of the execution
boundary, including success, no changes, stale requirements, duplicate
candidate handling, timeout, interruption / reconciliation, artifact failure,
secret-boundary regression, and artifact restore. Normal CI must not require a
live external AI provider merely to prove these contracts.

No additional execution-input architecture decision is required before Phase 47
or Phase 48 can begin. A downstream phase that needs to change a Phase 45 or
Phase 46 invariant must do so as an explicit contract / ADR change rather than
as an implementation detail.

## Phase 46 Final Verification

Phase 46 is complete only when repository, Redmine, and roadmap evidence jointly
demonstrate that:

- Phase 46-1 through Phase 46-5 are complete;
- the canonical contract contains execution eligibility, exact approved Brief
  recovery, handoff identity validation, requirements revalidation,
  pre-execution rejection, exact source revision, execution identity, the
  reserved Phase 47 gate, immutable snapshot, logical execution record, durable
  `Agent Running` boundary, physical Redmine mapping, environment binding, and
  concrete execution-ID serialization;
- the v0.3.0 handoff semantics remain authoritative and are consumed rather than
  redefined;
- the existing requirements-fingerprint selection, canonicalization, and hash
  representation are reused rather than duplicated in the Runner;
- pre-execution rejection remains distinct from a started execution attempt;
- exact source-revision failure and current Phase 47 gate failure route to
  `Needs Human + eligibility_failed` before `execution_id` allocation;
- `execution_id` is allocated only after the Phase 47 gate succeeds and identifies
  one attempt using the canonical lowercase UUIDv4 representation;
- repository plus exact immutable source revision identifies the execution
  source, rather than a moving branch name alone;
- approved Brief identity, requirements-fingerprint identity, repository,
  `source_revision`, and `execution_id` are immutable for the lifetime of one
  execution attempt and are not reinterpreted from later mutable state;
- the physical mapping matches the provisioned Redmine capability verified by
  #5402, including exact 71-character requirements-fingerprint storage;
- portable logical field mapping remains name / type / constraint based while
  numeric custom-field IDs remain environment binding facts;
- approval metadata and execution metadata use separate fields and write
  responsibilities;
- Redmine remains the only durable execution-state Source of Truth;
- Agent start remains forbidden before a successful, verifiable durable
  `Agent Running` start mutation;
- the current `040_ロードマップ` reflects the same Phase 45 / Phase 46 / Phase
  47 boundary and ordering;
- documentation precedence identifies this file as canonical for Agent Runner
  execution input / identity / execution-record facts; and
- Phase 47 security implementation and Phase 48-50 runtime / artifact / test
  implementation remain downstream responsibilities rather than Phase 46
  implementation.

The 2026-09-13 #5402 verification provides the current-environment evidence for
manual provisioning, environment binding, list validation, guarded writer
access, exact read-back, 71-character requirements-fingerprint storage, durable
`Agent Running` start mutation, journal history, and cleanup.

Phase 46-6 adds no new architecture decision. The existing Phase 45 ADRs remain
sufficient; only documentation precedence needs to identify this canonical
contract.
