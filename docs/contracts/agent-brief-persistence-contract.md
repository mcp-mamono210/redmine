# Agent Brief Persistence Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the Phase 37 versioned persistence boundary for validated
Agent Briefs.

Phase 35 defines the human-reviewable Agent Brief artifact and its
`brief_revision`. Phase 37 binds each stored Brief revision to an immutable
persisted revision so later Human Review and Handler Validation can identify the
exact artifact that was reviewed.

This contract defines storage identity, path derivation, revision monotonicity,
discovery, immutability, and the write-permission boundary. It does not define
Redmine approval state, requirements fingerprinting, Queue state, or Agent
execution.

## Storage strategy

For v0.3.0, Agent Briefs use repository-local Git storage in the application
repository named by the Brief's `repository` frontmatter field.

The current Redmine MCP Server deployment therefore stores Briefs in
`mcp-mamono210/redmine`.

A separate dedicated Brief repository is not part of v0.3.0. Introducing one
would require a new repository mapping, cross-repository permission boundary,
and discovery rule, so it requires an explicit contract and ADR change.

The repository-local strategy has these properties:

- the repository itself supplies the implementation-target namespace;
- Brief history is reviewed and versioned beside the implementation source;
- no second repository mapping or credential boundary is required;
- the persistence writer can restrict mutations to one repository-local path
  family;
- Git object identity provides an immutable persisted-revision reference.

A format-version-1 Brief that uses `implementation_target` instead of
`repository` has no repository-local storage mapping in v0.3.0. Persistence must
fail closed for that target kind rather than guess a repository.

## Source of truth

Redmine remains the source of truth for requirements, priority, business state,
and approval metadata.

The validated Agent Brief Markdown stored under this contract is the source of
truth for Brief content and Brief revision history.

Git storage metadata identifies the immutable persisted revision. Runtime state
does not become Brief-storage state.

## Supported storage target

Before persistence, the caller supplies a validated Phase 35 Agent Brief and a
configured canonical storage-repository identifier.

Persistence is allowed only when all of the following are true:

1. the Brief contains `repository`, not `implementation_target`;
2. the Brief `repository` value exactly equals the configured canonical storage
   repository identifier;
3. `redmine_issue_id` and `brief_revision` are valid according to the Phase 35
   Agent Brief contract.

A target mismatch is a contract failure. The persistence layer must not rewrite,
normalize, or silently substitute the Brief target.

## Artifact identity

Within one storage repository, a persisted Brief identity is:

```text
(repository, redmine_issue_id, brief_revision)
```

Because the storage repository must equal the Brief `repository` target, this
preserves the Phase 35 identity of Issue + implementation target + Brief
revision without duplicating the repository name inside the storage path.

Two different Brief byte sequences must never share the same persisted identity.

## Canonical storage path

The canonical path for a Brief revision is:

```text
docs/agent-briefs/<redmine_issue_id>/revisions/<brief_revision>.md
```

Both placeholders use unquoted base-10 positive integers with no leading zeroes.

Example:

```text
docs/agent-briefs/5362/revisions/1.md
docs/agent-briefs/5362/revisions/2.md
```

The path is derived from validated Brief metadata. A persistence caller does not
supply an arbitrary destination path.

No mutable `current.md`, `latest.md`, symlink, sidecar pointer, or status file is
required for discovery.

## Brief revision history

Revision history is monotonic per `(repository, redmine_issue_id)`.

The first persisted Brief uses:

```text
brief_revision: 1
```

After revision `N` exists, the next new Brief revision must be exactly `N + 1`.

Persistence must reject:

- a first revision other than `1`;
- a gap such as persisting revision `4` when the current revision is `2`;
- a non-positive revision;
- a revision that conflicts with an existing artifact.

The Phase 35 rule still applies: any change to the human-reviewable artifact
requires a new Brief revision.

## Immutability and idempotency

A canonical revision path is create-only through the persistence boundary.

The persistence boundary must not update or delete an existing revision file.

If the exact identity already exists:

- byte-identical Markdown is an idempotent success and must not create a new
  revision;
- different Markdown is a revision conflict and must fail.

An external/manual mutation of a historical revision path is a storage-contract
violation. The persistence boundary must never treat such a mutation as the
normal way to revise a Brief.

A revised Brief is stored at the next revision path instead.

## Persisted revision

`persisted_revision` is an opaque immutable Git object identifier bound to the
exact stored Brief bytes.

For the v0.3.0 Git strategy, the preferred persisted revision is the Git blob
object ID for the canonical Brief file after the file is reachable from the
repository's canonical branch.

The contract does not fix the Git object hash algorithm or object-ID length.

The persistence result must make these values available to later phases:

```text
repository
artifact_path
redmine_issue_id
brief_revision
persisted_revision
```

`persisted_revision` is storage metadata. It is not added to the Phase 35 Agent
Brief frontmatter and therefore does not recursively change the artifact it
identifies.

## Canonical branch and reachability

A Brief is considered persisted only after its canonical path is reachable from
the storage repository's canonical branch.

For the current repository, that branch is `main`.

A temporary feature branch or Pull Request may stage a Brief, but staging alone
does not make that artifact the canonical persisted Brief.

Branch naming and commit-message naming are intentionally not part of this
contract because neither is required for identity, discovery, or immutability.

## Discovery contract

### Exact revision

Given `(repository, redmine_issue_id, brief_revision)`, derive the canonical path
and read that exact file.

The read result must include the immutable `persisted_revision` that identifies
the returned bytes.

### Current revision

To discover the current Brief for an Issue:

1. inspect only
   `docs/agent-briefs/<redmine_issue_id>/revisions/`;
2. accept only canonical positive-integer `*.md` revision filenames;
3. select the numerically greatest `brief_revision`;
4. validate the loaded Markdown with the Phase 35 validator;
5. verify that the embedded `redmine_issue_id`, `repository`, and
   `brief_revision` match the derived storage identity.

A malformed or conflicting entry is a contract failure. It must not be skipped
silently in order to select a different revision.

### Historical revision

Historical revisions remain directly addressable by their canonical revision
path. Discovery never rewrites historical content into a mutable "latest"
artifact.

## Approval-reference handoff

Phase 37 does not approve a Brief and does not define Redmine approval fields.

It does define the immutable reference that later approval phases can pin:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

That tuple is sufficient to re-read the exact persisted artifact that was
presented for Human Review or Handler Validation.

Phase 38 and Phase 40 own the workflow fields and operations that record or use
that reference.

## Write-permission boundary

The persistence writer is a domain-specific write boundary, not a generic Git
writer.

For one persistence request it may create only the single canonical Brief path
derived from the validated Brief identity.

The persistence boundary must not expose caller-controlled operations for:

- arbitrary repository paths;
- source-code edits;
- file deletion;
- historical Brief replacement;
- branch deletion or history rewriting;
- generic Git commits unrelated to Brief persistence.

A storage implementation may use lower-level Git or provider APIs internally,
but those APIs do not become the Phase 37 public boundary.

The v0.3.0 Phase 37 persistence boundary does not add or change a public MCP
Tool.

## Stored state

The stored artifact is the validated Phase 35 Agent Brief Markdown.

Git may additionally retain normal repository metadata such as object IDs,
commits, authorship, and timestamps. Those values are storage metadata rather
than Brief fields.

The Brief storage contract must not introduce workflow or runtime fields such
as:

```text
status
approval_state
queue
claim
lease
heartbeat
retry
running
completed
workspace
execution_state
agent_output
ci_state
pull_request_state
deployment_state
```

Redmine owns approval/business state. Future runtime components own execution
state.

## Validation before persistence

Persistence must operate on a Brief that successfully satisfies the canonical
Phase 35 validation contract.

Malformed or unsupported Brief content is not a persistable artifact.

The persistence implementation must not silently repair the Brief, insert
missing frontmatter, change `brief_revision`, change `repository`, or remove
invalid runtime fields in order to make persistence succeed.

## Failure categories

Implementations may use internal error types, but callers must be able to
distinguish at least these semantic failures:

```text
invalid_brief
unsupported_storage_target
storage_target_mismatch
revision_gap
revision_conflict
artifact_not_found
stored_identity_mismatch
storage_write_failure
```

Diagnostics must not contain credentials or secret values.

## Public-surface boundary

Phase 37 persistence is an internal application boundary for v0.3.0.

This contract does not add:

- a public MCP persistence Tool;
- arbitrary Git CRUD;
- a generic repository writer;
- a Redmine approval transition;
- a Queue or Agent runtime API.

If a future requirement needs a public persistence Tool or a dedicated Brief
repository, that is a separate public-contract / architecture change.

## Phase handoff

Phase 37-2 implements the create-only persistence and read/discovery behavior
defined here.

Phase 37-3 verifies revision traceability, historical retrieval, idempotency,
conflict handling, exact persisted-revision retrieval, and the write boundary.

Phase 38 may consume the immutable approval-reference tuple but must not move
approval state into Git.

Phase 39 owns requirements fingerprint canonicalization and stale-Brief
detection.

Phase 40 owns explicit approval handling.
