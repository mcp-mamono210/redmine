# Agent Brief Requirements Fingerprint Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Fingerprint input format version: `1`

## Purpose

This document defines the canonical Phase 39 requirements-fingerprint input and
hashing contract used to determine whether a persisted Agent Brief still
represents the current implementation requirements.

The fingerprint is a deterministic digest of the requirement-bearing view that
Phase 36 made available to Brief generation. It is not a digest of the complete
Redmine Issue, and it is not a workflow timestamp.

This contract is internal to the Agent Brief boundary. It does not add or
change a public MCP Tool, public MCP input schema, or public MCP output shape.

## Responsibility boundary

Phase 39 requirements fingerprinting owns:

- deriving one canonical semantic payload from a valid Phase 36 generation
  input;
- excluding workflow, approval, audit, and projection-only metadata from that
  payload;
- serializing the payload deterministically;
- hashing the canonical UTF-8 bytes with SHA-256;
- returning the lowercase `sha256:` representation required by the Phase 35
  Agent Brief contract.

Phase 39-1 does not own:

- production fingerprint-generator implementation;
- comparison with a persisted Brief fingerprint;
- CURRENT / STALE business result handling;
- Redmine lifecycle mutation;
- approval metadata writes;
- `Ready for Agent` transition;
- Agent execution or runtime state.

Phase 39-2 implements this contract. Phase 39-3 owns fingerprint comparison and
staleness detection. Phase 40 owns lifecycle mutation and approval
orchestration after the comparison result is known.

## Source contract

Fingerprint input format version 1 is derived from a valid Phase 36
`AgentBriefGenerationInput` produced under
`docs/contracts/agent-brief-generation-input-contract.md`.

Phase 39 does not independently reinterpret a raw Redmine Issue. This keeps the
selection, sanitization, bounds, and deterministic ordering of requirement
sources aligned with the same view used to construct the Brief.

The fingerprint therefore represents the bounded requirement-bearing input
that the Brief generator could consume. Redmine content omitted by the Phase 36
selection or context bounds is outside fingerprint format version 1. A future
change that needs broader source coverage must revise the generation-input
contract and the fingerprint contract together rather than silently hashing a
different source set.

## Canonical semantic payload

A fingerprint-input-format-version-1 payload has this logical JSON-compatible
shape:

```json
{
  "format_version": 1,
  "scope": {
    "project_id": 414,
    "tracker_id": 2,
    "fixed_version_id": 29
  },
  "subject": "Requirements fingerprint",
  "description": "Same requirements produce the same fingerprint.",
  "requirement_custom_fields": [],
  "journal_notes": [],
  "relations": [],
  "children": []
}
```

`scope.fixed_version_id` is omitted when the Phase 36 input has no fixed
version. No other key is optional in format version 1.

The canonical payload is not persisted as a new Redmine or runtime artifact by
this contract. It is an intermediate value used to calculate
`requirements_fingerprint`.

## Included requirement semantics

The following Phase 36 values contribute to the canonical payload.

### Scope anchors

The payload includes:

- `source.project.id` as `scope.project_id`;
- `source.tracker.id` as `scope.tracker_id`;
- optional `source.fixed_version.id` as `scope.fixed_version_id`.

These stable IDs are included because moving an Issue between implementation
scopes, changing its tracker classification, or moving it to a different fixed
version can change the implementation context even when free text is unchanged.
Display names are not hashed because an administrative rename by itself is not
a requirements change.

### Subject and description

The payload includes Phase 36 `source.subject` and `source.description` exactly
as emitted by the valid generation input.

Phase 39 does not trim, translate, summarize, case-fold, or otherwise
re-normalize these values. Phase 36 normalization, sanitization, and bounds are
a prerequisite to this contract.

### Requirement custom fields

Each emitted Phase 36 requirement custom field contributes:

- `id`;
- `name`;
- `value`.

Fields remain in the Phase 36 canonical ascending-ID order. Array-valued custom
fields preserve their Phase 36 value order.

The projection-policy allowlist itself is not hashed. If a policy change causes
the effective emitted requirement custom fields to change, the semantic payload
changes naturally.

### Journal notes

`journal_notes` contains only the emitted Phase 36 `notes` strings, in the same
chronological order as the Phase 36 generation input.

Journal `id` and `created_on` are excluded because they are audit/source
identity metadata rather than implementation requirements. Adding, removing,
or changing retained note content still changes the ordered `journal_notes`
array and therefore changes the fingerprint.

### Relations

Each emitted Phase 36 relation contributes:

- `relation_type`;
- `related_issue_id`;
- optional `delay`.

The Phase 36 canonical relation order is preserved. The Redmine relation record
`id` is excluded because replacing a relation record with an equivalent
relation must not change the requirements fingerprint solely because the
record identity changed.

### Direct children

Each emitted Phase 36 child contributes:

- child `id`;
- child `subject`;
- optional child `tracker.id` as `tracker_id`.

Children remain in the Phase 36 ascending child-Issue-ID order. The child Issue
ID is requirement-bearing linkage identity and is therefore retained.

## Explicitly excluded information

The following values do not contribute to fingerprint input format version 1.

### Phase 36 source and projection metadata

- `source.redmine_issue_id`;
- `source.source_updated_on`;
- project, tracker, and fixed-version display names;
- `projection.requirement_custom_field_ids`;
- `projection.redacted_paths`;
- `projection.truncated_paths`;
- all `projection.omitted` counts;
- journal `id` and `created_on`;
- relation record `id`.

`redmine_issue_id` remains independently bound by the Phase 35 Agent Brief
frontmatter and Phase 37 persistence identity. It is traceability, not
requirement content.

`source_updated_on` is deliberately excluded. A timestamp mismatch alone must
never make a Brief stale.

Projection redaction/truncation/omission metadata records how the bounded view
was produced, but does not itself change the requirement semantics visible to
the Brief generator. The resulting retained field values do contribute.

### Workflow, ownership, approval, and runtime state

The Phase 36 source contract already excludes workflow and ownership fields
such as status, priority, author, assignee, dates, done ratio, estimated hours,
privacy, allowed statuses, watcher data, attachment metadata, and journal
field-change details. They remain excluded here.

The fingerprint must also exclude all Phase 38 approval and lifecycle metadata,
including:

- Agent Brief lifecycle;
- approver identity;
- approval timestamp;
- approved Brief revision;
- approved persisted revision;
- approved requirements fingerprint.

Runtime-only information remains excluded, including Queue, claim, lease,
heartbeat, retry, workspace, execution state, Agent output, CI state, Pull
Request state, and deployment state.

Changing only an excluded value must not change the requirements fingerprint.

## Canonical construction rules

Given a valid Phase 36 generation input, construct the semantic payload in this
exact property order:

1. `format_version`;
2. `scope`;
3. `subject`;
4. `description`;
5. `requirement_custom_fields`;
6. `journal_notes`;
7. `relations`;
8. `children`.

Within `scope`, property order is:

1. `project_id`;
2. `tracker_id`;
3. optional `fixed_version_id`.

Requirement custom fields use property order `id`, `name`, `value`.

Relations use property order `relation_type`, `related_issue_id`, optional
`delay`.

Children use property order `id`, `subject`, optional `tracker_id`.

The canonicalizer must preserve Phase 36 array order and must not apply a new
locale-sensitive sort.

## Missing and empty values

Format version 1 uses these rules:

- `scope.fixed_version_id` is omitted when absent;
- `description` is always present and may be the empty string when permitted by
  the Phase 36 contract;
- `requirement_custom_fields`, `journal_notes`, `relations`, and `children` are
  always present, including when empty;
- optional relation `delay` is omitted when absent;
- optional child `tracker_id` is omitted when absent;
- `null` is not emitted for any optional value;
- Phase 39 must not invent a missing required Phase 36 value.

Because the source must already be a valid Phase 36 generation input, Phase 39
does not convert missing invalid source fields into empty strings or default
IDs.

## Canonical serialization

The semantic payload is serialized as canonical JSON using the same
reproducibility conventions as Phase 36:

- UTF-8 encoding;
- LF line endings;
- two-space indentation;
- the exact object property order defined by this contract;
- arrays in the deterministic order inherited from Phase 36;
- exactly one trailing LF.

The hash input is the exact UTF-8 byte sequence of this serialization.

Implementations must not hash:

- JavaScript object debug output;
- locale-specific text rendering;
- platform-native line endings;
- a differently ordered but logically equivalent object;
- the complete Phase 36 generation-input JSON including excluded metadata.

## Hash algorithm and representation

Fingerprint input format version 1 uses SHA-256 over the canonical serialized
UTF-8 bytes.

The externally stored value is:

```text
sha256:<64 lowercase hexadecimal characters>
```

Uppercase hexadecimal is not canonical.

The representation matches the existing Phase 35 Agent Brief contract and the
Phase 38 approved-requirements-fingerprint mapping contract.

The value is opaque outside Phase 39. Consumers compare complete canonical
fingerprint strings; they do not parse semantic information from the digest.

## Canonical test vector

For the canonical semantic payload shown below, including its final LF:

```json
{
  "format_version": 1,
  "scope": {
    "project_id": 414,
    "tracker_id": 2,
    "fixed_version_id": 29
  },
  "subject": "Requirements fingerprint",
  "description": "Same requirements produce the same fingerprint.",
  "requirement_custom_fields": [],
  "journal_notes": [],
  "relations": [],
  "children": []
}
```

SHA-256 must produce:

```text
sha256:421a17880d514fa7f8446f3391e418f5b8b114f83deab95bc8d3417f715260fe
```

Phase 39-2 regression tests should include this vector so serialization changes
cannot silently change existing fingerprints.

## Required behavioral properties

Format version 1 must satisfy all of these properties:

- byte-equivalent semantic payloads produce the same fingerprint;
- changing included scope identity changes the fingerprint;
- changing subject or description changes the fingerprint;
- changing an emitted requirement custom-field identity, name, or value changes
  the fingerprint;
- changing retained journal-note content changes the fingerprint;
- changing retained relation semantics changes the fingerprint;
- changing retained direct-child identity or content changes the fingerprint;
- changing only status or assignee does not change the fingerprint;
- changing only approval or Agent Brief lifecycle metadata does not change the
  fingerprint;
- changing only `source_updated_on` does not change the fingerprint;
- changing only runtime state does not change the fingerprint.

The contract defines byte equality, not natural-language semantic equivalence.
For example, rewording a description with equivalent meaning changes the
fingerprint because the normalized requirement-bearing text changed.

## Secret-safety boundary

Phase 39 must hash only the sanitized Phase 36 values. It must not reconstruct
or hash raw configured secrets that Phase 36 removed.

The fingerprint itself is safe to expose as a digest, but diagnostics must not
copy raw pre-sanitization Redmine content or configured secret values.

Changing a raw secret to another value that Phase 36 normalizes to the same
`[REDACTED]` requirement view does not change the fingerprint. Credentials are
not implementation requirements.

## Failure behavior

Fingerprint generation must fail closed rather than return a normal
fingerprint when:

- the input cannot be established as a valid Phase 36 generation input;
- the fingerprint payload cannot be constructed according to this contract;
- canonical serialization fails;
- hashing does not produce the required SHA-256 representation.

A failure is not equivalent to STALE and is not equivalent to CURRENT. Phase
39-3 must preserve that distinction when it defines the staleness result
boundary.

No failure path may fall back to `source_updated_on` comparison.

## Compatibility and versioning

`format_version: 1` versions the fingerprint semantic input and canonical
serialization rules. It is separate from the Phase 35 Agent Brief
`format_version`, even though both are currently `1`.

For v0.3.0, fingerprint-input format version 1 is immutable once Briefs using
this algorithm are persisted. A future change to any of the following is an
incompatible fingerprint change:

- included or excluded semantic fields;
- missing/empty-value behavior;
- object property order used for canonical serialization;
- array ordering semantics;
- text source normalization boundary;
- hash algorithm or external representation.

Such a change must not silently replace the v1 algorithm. It requires an
explicit compatibility/migration decision and, when necessary, a corresponding
Agent Brief contract revision so a stored fingerprint can be interpreted
unambiguously.

## Phase connections

### Phase 35

The output satisfies the existing Agent Brief frontmatter requirement:

```text
requirements_fingerprint: sha256:<64 lowercase hexadecimal characters>
```

Phase 35 continues to treat the value as opaque.

### Phase 36

Phase 36 owns source selection, sanitization, bounds, and deterministic ordering.
Phase 39 derives its semantic payload from that valid output and deliberately
removes non-requirement source/audit/projection metadata before hashing.

### Phase 37

The fingerprint stored in a persisted Agent Brief is immutable with that Brief
revision. Phase 37 continues to own Brief revision and persisted-revision
identity.

### Phase 38

Redmine approval metadata may copy an approved requirements fingerprint, but
approval metadata is not an input to a new requirements fingerprint.

### Phase 40

Phase 40 may act on the Phase 39-3 comparison result. Phase 39-1 does not
transition a stale Issue to `Brief Draft` and does not grant `Ready for Agent`.
