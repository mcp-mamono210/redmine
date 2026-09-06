# ADR-012: Use a strict versioned Markdown Agent Brief contract

Status: Accepted  
Date: 2026-09-06

## Context

Phase 35 requires one canonical Agent Brief contract that can be consumed by
context projection, versioned persistence, requirements fingerprinting, and
approval validation.

Earlier design material used illustrative Markdown and frontmatter examples,
but the examples used different names for content revision and format version
and did not define a machine-validation failure model. Treating those examples
as an implicit schema would leave downstream phases to make incompatible
choices.

The Brief must remain suitable for human review while giving an Agent a bounded
execution contract. It must also avoid duplicating Redmine workflow state or
future Controller runtime state.

## Decision

For target release v0.3.0:

- use UTF-8 Markdown as the Agent Brief artifact representation;
- use a restricted scalar frontmatter mapping for traceability and version
  metadata;
- distinguish document `format_version` from content `brief_revision`;
- require exactly one Redmine Issue and one repository or other implementation
  target;
- store the generation-time requirements fingerprint as an opaque SHA-256
  value while leaving fingerprint canonicalization to Phase 39;
- require an exact, ordered set of implementation sections;
- give Acceptance Criteria stable identifiers and require Verification to cover
  every identifier;
- reject checked Acceptance Criteria and runtime metadata because execution
  progress does not belong in the Brief;
- use a non-throwing validation result with categorized issues;
- reject unknown metadata, unknown top-level sections, and unsupported format
  versions rather than guessing their meaning.

The exact format and validation behavior are defined in
`docs/contracts/agent-brief-contract.md` and its executable unit tests.

Phase 35 does not add an MCP Tool, persistence API, Redmine transition,
fingerprint algorithm, approval operation, Queue, or Agent runner.

## Consequences

Human reviewers and coding agents receive the same readable artifact, while
downstream code can fail closed on missing or ambiguous structure.

Strict versioning makes compatibility changes explicit. Adding a new required
field or section requires a new format version and matching consumer support.

The restricted frontmatter subset avoids adding a general YAML parser before a
need for YAML features exists. A future move to a richer representation is a
format-version change rather than a silent parser expansion.

Persistence cannot enforce revision monotonicity in Phase 35 because no
versioned storage boundary exists yet. Phase 37 must bind the validated Brief
revision to an immutable persisted revision. Phase 39 must define the
fingerprint canonicalization that produces the value validated here.
