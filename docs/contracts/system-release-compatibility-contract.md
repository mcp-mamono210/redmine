# v0.4.0 System Release Compatibility Contract

Status: canonical Phase 51 release-preparation contract  
Target milestone: v0.4.0  
Semantic revision: `2`  
Owner: `mcp-mamono210/redmine`

## Purpose

This contract defines the Phase 51 cross-component release-compatibility boundary
between Redmine MCP and Agent Runner. It does not add execution, artifact,
lifecycle, retry, Git push, CI feedback, PR, merge, deployment, or distributed
execution capability.

The v0.4.0 functional boundary remains:

```text
Ready for Agent
    -> safe one-shot Agent execution
    -> durable immutable artifact
    -> Ready for Independent Verification
```

Redmine MCP and Agent Runner remain independently versioned components. The
v0.4.0 value is a system-level compatibility milestone and is not a component
version-selection rule.

## Canonical ownership

The canonical Phase 51 compatibility contract, semantic-revision registry,
expected handoff profile, evidence schemas, compatibility evidence, manifest,
and Phase 52 handoff live in `mcp-mamono210/redmine`.

Agent Runner may expose component-local probes and raw verification evidence,
but it must not host a competing canonical copy of this contract, the canonical
handoff profile, or the system release compatibility manifest.

README files may explain the compatibility boundary and point to canonical
records. They are not a duplicate compatibility Source of Truth.

## Contract identity model

Contract semantic identity and source identity are separate:

```text
semanticRevision
  = normative meaning of the contract

sourceRevision
  = exact Git revision used to retrieve the contract source

sourceBlobSha
  = exact Git blob identity of the verified contract bytes
```

A Git commit or blob change alone does not imply a semantic revision.

### Change classification and compatibility impact

Contract changes are classified on two independent axes.

```text
changeClassification:
  editorial
  operational-normative
  compatibility-semantic

compatibilityImpact:
  none
  affected
  unknown
```

`editorial` covers typo, formatting, heading/link, non-normative example, and
wording clarification that provably does not change normative meaning. It does
not increment `semanticRevision`.

`operational-normative` covers normative release-operation rules such as
registry finalization, evidence finalization, release-Gate operation, and
verification ordering when producer/consumer compatibility semantics are
unchanged. It increments `semanticRevision`.

`compatibility-semantic` covers changes to compatibility-facing invariants,
required fields/schemas, identity semantics, lifecycle/outcome semantics,
ownership, authorization/security requirements, artifact compatibility, or
producer/consumer handoff semantics. It increments `semanticRevision`.

Compatibility re-execution is controlled by `compatibilityImpact`, not by the
semantic revision alone:

```text
compatibilityImpact = none
  -> record why cross-component semantics are unchanged
  -> full Phase 51-4 re-run is not required

compatibilityImpact = affected
  -> dependent compatibility evidence is invalid
  -> Phase 51-4 re-run is required

compatibilityImpact = unknown
  -> fail closed
  -> dependent compatibility evidence is invalid
  -> Phase 51-4 re-run is required
```

`operational-normative + compatibilityImpact = none` is allowed only when the
change is shown not to alter the Ready-for-Agent handoff profile,
producer/consumer semantics, artifact semantics, or lifecycle/outcome
semantics.

A classification/invalidation-rule change is not outside this model. It is
`operational-normative`; if `compatibilityImpact = none` cannot be demonstrated,
its impact is `unknown` and fails closed. If a compatibility PASS already exists
when such a rule changes, reuse of that PASS must be re-evaluated under the new
rule and the decision recorded.

Semantic revision 2 introduces the registry finalization, validation-mode, and
history-preservation rules below. It is classified
`operational-normative / compatibilityImpact = none` because it changes how the
canonical registry identity is finalized and guarded without changing the
Ready-for-Agent profile, producer/consumer semantics, artifact semantics, or
lifecycle/outcome semantics. At the time of this revision Phase 51-4 has not
produced a compatibility PASS to invalidate.

Unknown impact must never be guessed to be editorial or impact-free.

### Registry state and blob closure

Every required registry entry is checked mechanically:

```text
actual Git blob(repository, sourceRevision, path)
==
registry.sourceBlobSha
```

`registrationState` is required and closed to:

```text
committed
pending-first-commit
```

Unknown values are schema errors.

A contract whose source revision cannot exist until its changed bytes have been
committed may temporarily use:

```text
registrationState = pending-first-commit
sourceRevision = null
```

This is a staging state only. It is not release-valid.

### Registry finalization responsibility

A source-identity refresh uses two commits with distinct responsibilities.

```text
A: contract-content commit
   - fixes the exact contract bytes
   - fixes semanticRevision
   - fixes sourceBlobSha
   - records registrationState = pending-first-commit
   - records sourceRevision = null

B: registry-finalization commit
   - reads the contract at exact revision A
   - verifies actualBlobSha == registry.sourceBlobSha
   - sets registrationState = committed only after the equality passes
   - sets sourceRevision = A
```

The registry-finalization commit must not replace A as the contract
`sourceRevision`. The exact concrete script or command used to perform this
mechanism is non-normative operational documentation; script/function names are
not contract identity.

The contract-content commit referenced by `sourceRevision` must remain
retrievable from the main-branch history. A merge strategy that removes that
commit from the resulting main history is invalid for this source-identity
finalization flow.

### Staging and strict validation modes

`staging` mode exists only for a work branch while source identity is being
finalized. It may accept the single allowed `pending-first-commit` state. Staging
output must not be used as release evidence and is not an acceptable final PR or
main-branch state.

`strict` mode is required for:

```text
final PR state
main branch
release-quality CI gate
Phase 51-4
Phase 51-5
Phase 51-6
```

Strict validation rejects every remaining `pending-first-commit` entry and
verifies committed local contract source revisions and blob identities.

The main branch must enforce strict registry validation mechanically in CI.
This Gate is authoritative even if a merge strategy is chosen incorrectly: a
missing `sourceRevision` commit or blob mismatch must make the pipeline fail.

## Canonical evidence layout

Canonical JSON evidence uses these fixed paths:

```text
docs/verification/phase51-redmine-mcp-rc-identity.json
docs/verification/phase51-redmine-mcp-rc-verification.json

docs/verification/phase51-agent-runner-rc-identity.json
docs/verification/phase51-agent-runner-rc-verification.json
docs/verification/phase51-agent-runner-real-infrastructure-decision.json

docs/verification/phase51-cross-component-compatibility.json
docs/verification/v0.4.0-release-compatibility-manifest.json
docs/verification/phase51-final-verification.json
docs/verification/phase51-phase52-handoff.md
```

Raw component-local evidence is referenced by repository, exact source revision,
path, and evidence identity. It is not copied into the canonical repository.

## Common evidence envelope

Every canonical Phase 51 JSON evidence record uses:

```json
{
  "schemaVersion": 1,
  "recordType": "...",
  "generation": 1,
  "generationId": "sha256:...",
  "current": {},
  "history": [],
  "supersedes": null
}
```

`generationId` is the SHA-256 identity of canonical JSON containing
`recordType`, `generation`, and `current`.

When a current record is invalidated, its history entry records at least:

```text
generation
generationId
snapshot
invalidatedAt
invalidationReason
invalidatingDefectIssueId
```

A Phase 51 blocking-defect invalidation requires the Redmine defect issue ID.
Git history alone is not the evidence audit trail.

## Runtime artifact and component-version rule

Runtime-affecting content includes production source, runtime-affecting package
metadata or dependency resolution, build-output-affecting configuration,
runtime-loaded configuration/schema/assets, and implementation that changes a
machine-consumed public contract.

The following are non-runtime by themselves:

```text
docs/**
tests/**
docs/verification/**
human-readable release notes
```

`scripts/phase51/**` is non-runtime only when it is verification-only, is not
referenced by the production startup path, is not runtime-loaded/bundled, and
does not alter the production dependency graph.

Version decision:

```text
runtime artifact changed
  -> released component version reuse prohibited

externally observable component contract changed
  -> released component version reuse prohibited

runtime artifact unchanged
+ externally observable contract unchanged
+ docs/tests/verification-only changes
  -> existing component version may be retained
```

The system milestone number is not a component-version input. If an independent
component decision produces the same number as the milestone, the rationale is
recorded explicitly.

## Canonical expected handoff profile

`docs/contracts/system-release-handoff-profile.json` is projected from the
canonical Ready-for-Agent handoff, lifecycle, Redmine mapping, and requirements
fingerprint contracts. It is not derived by blessing the current producer or
consumer implementation.

Semantic constraints are structured identities rather than free-form text.
The current canonical handoff profile defines at least:

```text
redmine-principal-v1
rfc3339-offset-timestamp-v1
positive-safe-base10-integer-v1
nonblank-opaque-string-v1
sha256-lowercase-hex-v1
```

Each constraint has deterministic positive and negative vectors.

Profile normalization is exact and fail-closed:

```text
object key order      = canonical schema order for serialization
array order           = contract-defined order
missing               != null
string comparison     = exact bytes unless the contract says otherwise
enum/constraintId     = exact, case-sensitive
unknown field         = reject
unknown constraintId  = reject
```

No heuristic semantic equivalence, implicit trim, case folding, or null
conversion is allowed.

## Compatibility verification method

Phase 51-4 is a three-layer Gate. All layers must pass.

### Layer A — canonical / producer / consumer three-way comparison

The canonical expected handoff profile is compared independently with a
normalized Redmine MCP producer semantic profile and a normalized Agent Runner
consumer semantic profile.

For each structured constraint:

```text
canonical constraintId
== producer declared constraintId
== consumer declared constraintId
```

and both implementations must pass the canonical positive/negative vectors.

The producer and consumer requirements-fingerprint implementation-source
identities are compared as full identities:

```text
repository
sourceRevision
path
blobSha
```

Every declared blob SHA is compared with the actual Git blob. Matching paths
with different bytes fail.

Two implementations drifting in the same direction from the canonical contract
also fail.

### Layer B — contract-derived deterministic handoff fixture

Expected fixture identity is generated from the canonical handoff profile, not
from producer output.

The fixture fixes at least:

```text
issueId
repository
approverIdentity
approvedAt
briefRevision
persistedRevision
requirementsFingerprint
```

The Redmine MCP production mapping boundary is exercised through a
verification-only capture seam. Its actual durable representation must equal the
contract-derived expected representation.

That actual representation is then passed through the Agent Runner production
handoff-validation responsibility. The concrete class/function name is not a
normative contract identity; the RC evidence records the actual binding used.
The validated result must equal the contract-derived expected handoff identity.

The same deterministic requirements fixture must produce identical canonical
requirements fingerprints on the Redmine MCP implementation and the Agent
Runner compatibility binding.

### Layer C — Phase 50 golden baseline conformance

The committed Agent Runner baseline is a canonical input:

```text
repository: mcp-mamono210/ai-agent-runner
path: docs/contracts/phase50-contract-baseline.json
```

The exact revision is recorded by Phase 51 RC evidence. Phase 51 does not
reconstruct that baseline from the current implementation.

At minimum the current RC combination must remain compatible with its execution
lifecycle identities, execution outcome identities, artifact format/required
identity, and Controller IAM requirements.

## Cross-repository verification architecture

The canonical orchestrator is verification-only code owned by
`mcp-mamono210/redmine`, normally under `scripts/phase51/`.

Component-local probes expose bounded JSON machine interfaces:

```text
JSON input
  -> production implementation / production binding
  -> JSON output
```

Redmine MCP owns producer profile, durable handoff representation, and canonical
fingerprint probes. Agent Runner owns consumer profile, production handoff
validation, fingerprint compatibility, and Phase 50 baseline verification
probes.

Cross-repository TypeScript source is not directly imported and neither
component becomes a production dependency of the other.

Before RC identity is fixed, Phase 51-2 and Phase 51-3 inspect whether each
component already has a machine-readable profile derivation source and a
production-boundary capture/invocation seam. Missing support is added as
verification support before the candidate source revision is frozen.

## Re-entry and defect ownership

Phase 51 Redmine re-entry uses three categories.

### Corrective re-entry

A newly discovered implementation or contract defect is owned by a Phase 51
blocking defect. That defect owns correction, identity refresh, verification
refresh, required compatibility re-run, and downstream evidence refresh.
Completed child tickets normally remain closed.

### Original completion defect

If a child ticket was closed while its own completion condition was not actually
satisfied, that child ticket is reopened.

### Post-close follow-up

If the original completion was valid but later review identifies missing proof,
negative control, guardrail, or operational clarification, the original child
remains closed and a `Phase 51 follow-up` is created under the Phase 51 parent.
Open Phase 51 follow-ups block the Phase 51 Final Gate.

A post-close follow-up must not be used to avoid reopening an incorrect original
completion. If follow-up investigation shows that the original completion
condition was false, reclassify it as an original completion defect and reopen
the original child.

Defect ownership remains:

```text
canonical contract correct + one implementation differs
  -> implementation owner

both implementations agree + canonical contract is wrong
  -> canonical contract owner

ownership unresolved
  -> do not guess Target Repository
```

Source-revision changes invalidate the corresponding RC verification and any
compatibility result derived from that component revision.

For a contract semantic-revision change, first evaluate `changeClassification`
and `compatibilityImpact`:

```text
compatibilityImpact = none
  -> record impact-none rationale
  -> full Phase 51-4 re-run not required
  -> refresh manifest/final evidence to the current contract identity as needed

compatibilityImpact = affected | unknown
  -> dependent compatibility evidence invalid
  -> Phase 51-4 re-run required
  -> regenerate downstream manifest after PASS
```

If the canonical expected handoff profile does not reference the changed
contract, the profile is not revised merely because that unrelated contract's
semantic revision changed.

A manifest created from an invalidated combination is stale and cannot be used
for release. Latest canonical verification evidence has precedence over
historical Redmine ticket status.

## Real infrastructure boundary

Phase 50 policy is unchanged:

```text
real private S3 verification
  = mandatory per system release

sandbox/environment conformance
  = mandatory per system release
```

Phase 51 may make a change-triggered real-S3 decision:

```text
PASS
FAIL
NOT_REQUIRED_WITH_REASON
```

`NOT_REQUIRED_WITH_REASON` requires a rationale. It never satisfies or removes
the Phase 52 mandatory system-release real-S3 Gate.

## Phase 52 handoff requirements

The Phase 52 handoff must reconstruct the exact system candidate from:

- system milestone identity;
- Redmine MCP component version, exact source revision, RC identity and RC
  verification evidence;
- Agent Runner component version, exact source revision, RC identity, RC
  verification, and real-infrastructure-decision evidence;
- required contract IDs, semantic revisions, source revisions, and blob IDs;
- canonical expected handoff profile identity;
- release compatibility manifest;
- Phase 50 final verification;
- Phase 51 compatibility and final verification;
- mandatory system-release real-S3 and sandbox/environment Gates, including
  command/input, environment, PASS condition, evidence location, and blocking
  behavior;
- known limitations; and
- explicit out-of-scope boundary.

Phase 51-6 consumes this handoff contract. It must not invent a different handoff
schema at Final Gate time.

## Out of scope

Phase 51 does not add:

```text
Git remote push
CircleCI/CI feedback loop
Agent correction/retry loop
retry-until-CI-passes
Pull Request automation
automatic merge
deployment automation
multiple Workers or Runner instances
distributed claim/lease/heartbeat/queue
```