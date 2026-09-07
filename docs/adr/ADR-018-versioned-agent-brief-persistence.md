# ADR-018: Store versioned Agent Briefs in the target application repository

Status: Accepted  
Date: 2026-09-07

## Context

Phase 35 established a strict versioned Markdown Agent Brief contract and left
persistence history to Phase 37.

Phase 36 established a bounded deterministic Redmine projection that can supply
the Redmine-derived inputs needed to create a Phase 35 Brief.

Phase 37 now needs a storage boundary that can answer four questions without
ambiguity:

1. Which Redmine Issue does this Brief belong to?
2. Which human-reviewable Brief revision is this?
3. Which immutable stored object represents those exact bytes?
4. How can a later Human Review or Handler Validation retrieve that exact
   artifact?

Two storage strategies were considered for v0.3.0:

- store the Brief in the application repository that it targets;
- create or use a dedicated cross-repository Brief store.

The current `mcp-mamono210` organization has the Redmine MCP Server application
repository available for this work and no established dedicated Agent Brief
storage repository or repository-mapping contract.

A dedicated repository would therefore introduce a second repository lifecycle,
cross-repository credentials, target-to-storage mapping, and an additional
discovery boundary before those requirements are needed.

The existing application repository already provides Git history, a canonical
branch, code review / CI integration, and a natural namespace for the
implementation target.

## Decision

For v0.3.0:

- store Agent Brief revisions in the application repository named by the
  validated Brief's `repository` field;
- require the configured storage repository to exactly match that Brief target;
- store revisions under
  `docs/agent-briefs/<redmine_issue_id>/revisions/<brief_revision>.md`;
- make revision paths create-only through the persistence boundary;
- use monotonically increasing positive `brief_revision` values starting at
  `1`;
- treat a byte-identical retry of an existing revision as idempotent success;
- reject different bytes for an existing revision identity;
- use an immutable Git object identifier for the exact Brief bytes as
  `persisted_revision`;
- consider an artifact canonical only when its path is reachable from the
  repository's canonical branch;
- derive current revision from the greatest canonical numeric revision path
  rather than maintaining a mutable `latest` or `current` pointer file;
- expose a domain-specific Brief persistence boundary rather than generic Git
  write operations;
- keep Redmine approval state and all Queue / Agent runtime state out of Brief
  storage;
- make `implementation_target` Briefs fail closed in v0.3.0 because no
  repository-local mapping exists for that target kind;
- do not add or change a public MCP Tool in Phase 37.

The exact persistence, discovery, revision, and permission rules are defined in
`docs/contracts/agent-brief-persistence-contract.md`.

Branch names and commit-message names are not part of the persistence identity
and are not fixed by this ADR.

## Consequences

Repository-local storage makes the repository itself the implementation-target
namespace, so the storage path does not need to duplicate or encode a repository
identifier.

Historical Briefs remain human-readable and reviewable beside the source they
constrain.

Create-only revision paths and immutable Git object identity make an approved
artifact recoverable without mutating the Phase 35 Brief to contain its own
storage revision.

No mutable `current` sidecar is needed. The current Brief is the highest valid
numeric revision in the Issue's canonical revision directory.

The persistence writer can be narrowly constrained to one derived
`docs/agent-briefs/**` create operation, reducing the risk that Brief persistence
becomes an arbitrary source-code writer.

A future dedicated Brief repository remains possible, but it would require a
new ADR and contract update defining repository mapping, cross-repository
permissions, and discovery semantics.

A future need to persist `implementation_target` Briefs likewise requires an
explicit storage mapping rather than an inferred repository.
