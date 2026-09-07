# ADR-021: Derive requirements fingerprints from the bounded generation-input semantics

Status: Accepted  
Date: 2026-09-07

## Context

Phase 35 requires every Agent Brief to store a lowercase SHA-256 requirements
fingerprint, but deliberately leaves canonicalization to Phase 39.

Phase 36 already defines the deterministic, sanitized, bounded Redmine
projection used as Brief-generation context. Hashing the complete Redmine Issue
would create a second requirement-selection policy and would allow workflow,
ownership, audit, approval, or runtime changes to make a Brief stale even when
its implementation requirements did not change.

Hashing the complete serialized Phase 36 generation input is also too broad.
That representation includes `source_updated_on`, Issue traceability, record
IDs used only for audit, and projection metadata that describe redaction,
truncation, and omission rather than the requirement semantics visible to Brief
generation.

Phase 39 therefore needs a deterministic semantic projection that remains
aligned with Phase 36 while excluding non-requirement metadata.

## Decision

For v0.3.0, calculate requirements fingerprints from a canonical semantic
payload derived from a valid Phase 36 `AgentBriefGenerationInput`.

The semantic payload:

- retains stable project, tracker, and optional fixed-version IDs as
  implementation-scope anchors;
- retains normalized/sanitized/bounded subject and description;
- retains emitted requirement custom-field identity, name, and value;
- retains journal note content but excludes journal ID and timestamp;
- retains relation semantics but excludes the Redmine relation record ID;
- retains direct-child Issue identity, subject, and optional tracker ID;
- excludes `redmine_issue_id`, `source_updated_on`, display-only scope names,
  and Phase 36 projection metadata;
- excludes status, assignee, approval metadata, Agent Brief lifecycle metadata,
  and runtime state;
- preserves Phase 36 deterministic array ordering instead of defining a second
  locale-sensitive ordering policy.

Serialize the semantic payload as UTF-8 canonical JSON with LF line endings,
two-space indentation, contract-defined property order, and one trailing LF.
Hash those exact bytes with SHA-256 and expose the result as lowercase
`sha256:<64 hex>`.

The exact input shape, exclusions, serialization rules, test vector, and
compatibility requirements are defined by
`docs/contracts/agent-brief-requirements-fingerprint-contract.md`.

Phase 39-1 defines only this contract and decision. Production fingerprint
generation is Phase 39-2. Fingerprint comparison and CURRENT / STALE detection
are Phase 39-3. Lifecycle mutation and approval orchestration remain Phase 40.

## Consequences

Status, assignee, approval metadata, and `updated_on` changes no longer create
false staleness because they are outside the fingerprint semantic payload.

The fingerprint remains aligned with the actual bounded requirement view used
for Brief generation. Phase 39 does not create a second unbounded Redmine
context path or reintroduce raw secrets removed by Phase 36.

Changes to retained requirement-bearing content deterministically change the
fingerprint. Content omitted by Phase 36 selection or bounds is outside v1
fingerprint scope because it was also outside the Brief-generation input. If a
future workflow needs broader requirement coverage, Phase 36 and Phase 39 must
be revised together.

The fixed canonical test vector makes accidental serializer changes visible to
Phase 39-2 regression tests.

Fingerprint-input format version 1 becomes compatibility-sensitive once Briefs
using it are persisted. Included fields, ordering, serialization, or hashing
must not change silently; an incompatible change requires an explicit migration
or versioning decision.
