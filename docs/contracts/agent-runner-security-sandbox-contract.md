# Agent Runner Security / Sandbox Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 47 contract for Agent Runner authorization,
repository-access policy, credential isolation, sandboxing, network / resource
policy, and secret-handling boundaries.

Phase 47-1 establishes the initial contract for:

- compatibility between Phase 46 exact-source resolution and Phase 47
  repository-access policy;
- an early repository allowlist pre-check that prevents credentialed access to
  an unauthorized repository before exact source revision resolution;
- the formal Phase 47 authorization / security gate at the position reserved by
  Phase 46;
- fail-closed repository authorization semantics;
- repository allowlist representation and comparison rules; and
- preservation of the Phase 46 `execution_id` allocation boundary.

Later Phase 47 tickets extend this same canonical contract with credential
isolation, sandbox / filesystem boundaries, network / resource / timeout policy,
secret-handling rules, and final Phase 46 / Phase 48 compatibility verification.

Phase 47 does not redefine the v0.3.0 approval handoff, the Phase 45 execution
Source-of-Truth / lifecycle ownership model, or the Phase 46 execution-input
identity and ordering contracts.

The upstream canonical contracts remain:

```text
docs/contracts/agent-runner-execution-boundary-contract.md
docs/contracts/agent-runner-execution-input-contract.md
```

## Phase 46 Compatibility

Phase 46 fixes the formal pre-start ordering as:

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
[ Phase 47 formal authorization / security gate ]
    |
    v
execution preparation entered
    |
    v
execution_id allocated
```

Phase 47-1 does not move the formal Phase 47 gate ahead of exact source revision
resolution. The formal gate remains after the exact immutable source revision is
fixed and before execution preparation / `execution_id` allocation.

Exact source resolution may nevertheless require repository access before the
formal gate, for example when resolving a branch, tag, symbolic ref, or `HEAD`
to one exact Git commit. Such repository access is subject to the Phase 47
repository-access policy defined here.

The compatibility clarification added to the Phase 46 execution-input contract
therefore changes no Phase 46 identity or ordering semantic. It only makes the
security policy governing repository access during source resolution explicit.

If implementing this policy would require changing any of the following, the
change must not be made as a local Phase 47 implementation detail:

```text
repository identity semantics
exact source revision semantics
formal Phase 47 gate position
execution_id allocation boundary
pre-execution rejection semantics
```

Such a change requires explicit review of the Phase 45 / Phase 46 canonical
contracts and any architecture decision that becomes necessary.

## Repository Identity Preservation

Phase 47 consumes the repository identity already resolved by the Phase 46
handoff boundary. It does not derive a second repository identity and does not
rewrite the Phase 46 value before authorization.

The runtime repository identity is therefore treated as an opaque canonical,
non-secret identity value supplied by the Phase 46 boundary:

```text
Phase 46 repository identity
    |
    v
Phase 47 authorization input
```

Phase 47 must not reinterpret that identity by case folding, URL rewriting,
removing a `.git` suffix, resolving host aliases, decoding a different URL form,
or deriving a repository from a filesystem path.

Any normalization defined by this contract applies only to configured allowlist
entries so they can be compared safely with the already-established Phase 46
repository identity. It must not mutate the runtime repository identity.

## Repository Access Pre-check

When exact source revision resolution requires repository access, the Runner
must perform an early allowlist pre-check before using repository credentials or
making the repository access.

The ordering for repository access is:

```text
Phase 46 repository identity resolved
    |
    v
Phase 47 early allowlist pre-check
    |
    v
repository identity authorized for repository access
    |
    v
repository access required for exact revision resolution
    |
    v
Phase 46 exact source revision fixed
    |
    v
Phase 47 formal authorization / security gate
```

The early pre-check exists only to prevent credentialed access to a repository
that is not permitted by the repository-access policy. It is not the formal
Phase 47 authorization / security gate reserved by Phase 46.

Successful early pre-check does not establish any of the following:

```text
execution attempt
execution_id
Agent Running
Agent start permission
```

The early pre-check must use the Phase 46 repository identity unchanged. It must
not resolve a branch, tag, `HEAD`, or another mutable source reference as part of
repository-identity authorization.

## Early Pre-check Failure

The early pre-check is fail closed. The repository must not be accessed when any
of the following applies:

```text
repository identity is not present in the allowlist
repository authorization is unknown or indeterminate
allowlist configuration is unavailable
allowlist configuration is invalid or ambiguous
```

The failure sequence is:

```text
early allowlist pre-check failed or unknown
    |
    v
repository access is not attempted
    |
    v
exact source revision resolution does not continue
    |
    v
execution_id is not allocated
    |
    v
Agent Running is not written
    |
    v
Agent is not started
    |
    v
lifecycle target = Needs Human
outcome = eligibility_failed
```

This is the existing Phase 46 pre-execution rejection semantics. It is not an
execution attempt. The Controller must not create a placeholder `execution_id`
or an empty started-execution record for the rejection.

The existing Phase 46 rejection mapping remains authoritative for durable
rejection facts. Phase 47-1 does not introduce a second rejection record shape.

## Authorization Gate

After Phase 46 has fixed the exact source revision, the candidate must pass the
formal Phase 47 authorization / security gate before execution preparation can
enter the `execution_id` allocation boundary.

The formal gate consumes at least:

```text
Phase 46 repository identity
+
exact source revision
```

The ordering is fixed:

```text
Phase 46 validation passed
    |
    v
requirements current
    |
    v
exact source revision fixed
    |
    v
Phase 47 formal authorization / security gate
    |
    v
execution preparation entered
    |
    v
execution_id allocated
```

At Phase 47-1, the repository-authorization portion of the formal gate must at
minimum re-establish that the unchanged Phase 46 repository identity is allowed
by the active allowlist. The already-fixed `source_revision` is authorization
input and must not be re-resolved from a branch, tag, `HEAD`, or other mutable
reference after the gate.

A successful early pre-check does not allow the formal gate to be skipped. The
formal gate evaluates the active authorization state at its reserved position.

## Repository Allowlist

The logical allowlist is a finite set of non-secret repository identity entries
used to authorize repository access and the formal execution gate.

Concrete configuration transport is not fixed by Phase 47-1. An implementation
may later bind the logical allowlist through an environment, configuration file,
or another deployment mechanism, but the security semantics in this section are
canonical.

Each allowlist entry must denote exactly one Phase 46 canonical repository
identity. Comparison follows these rules:

1. the runtime repository identity from Phase 46 is not modified;
2. leading and trailing ASCII whitespace may be removed from the configured
   allowlist entry before validation;
3. after that allowlist-entry-only normalization, the entry must be non-empty;
4. no case folding, host alias expansion, URL rewriting, path rewriting,
   percent-decoding, or automatic `.git` suffix addition/removal is permitted;
5. authorization uses exact string equality between the validated allowlist
   entry and the unchanged Phase 46 repository identity; and
6. one runtime repository identity must resolve to one unambiguous allowlist
   decision.

An explicitly configured empty allowlist is valid and authorizes no repository.
A missing, unreadable, syntactically invalid, or ambiguous allowlist
configuration is not equivalent to an empty allowlist; it is an unavailable /
invalid authorization configuration and fails closed.

Duplicate configured entries that normalize to the same value are invalid
configuration rather than additional authorization evidence. This keeps the
configured policy one-to-one and avoids ambiguous policy interpretation.

A repository identity absent from a valid allowlist is unauthorized. It must not
be classified as a configuration failure merely because it has no matching
entry.

The allowlist must not contain credentials, tokens, passwords, signed URLs, or
another secret-bearing repository locator.

## Fail-closed Boundary

Phase 47 authorization uses fail-closed semantics:

```text
unknown
!=
authorized
```

Both the early repository-access pre-check and the formal authorization gate
must reject when authorization cannot be established positively.

At minimum, all of the following are non-authorized results:

```text
repository is absent from a valid allowlist
allowlist configuration is missing
allowlist configuration is unreadable
allowlist configuration is invalid
allowlist entry comparison is ambiguous
authorization evaluation fails
authorization result is unknown or indeterminate
```

The current canonical routing for an early pre-check failure or a formal gate
failure is:

```text
lifecycle target = Needs Human
outcome = eligibility_failed
execution_id = not allocated
Agent Running = not written
Agent = not started
```

Phase 47-1 does not add a new authorization-specific durable outcome. If a later
Phase 47 decision requires one, it must explicitly review and update, as
applicable:

```text
Phase 45 canonical execution boundary contract
execution outcome taxonomy
required ADR / architecture decision
```

Until such an explicit contract change occurs, `eligibility_failed` remains the
canonical authorization-failure outcome.

## Execution ID Allocation Boundary

Phase 47-1 preserves the Phase 46 invariant:

```text
execution_id exists
=
Phase 46 pre-execution validation passed
+
requirements current
+
exact source revision fixed
+
formal Phase 47 authorization / security gate passed
+
execution preparation entered
```

The early allowlist pre-check is not sufficient to allocate an `execution_id`.
No early-pre-check rejection and no formal-gate rejection receives an execution
identifier.

Likewise, successful formal authorization does not itself mean that the Agent is
running or may start. The downstream Phase 46 start boundary remains:

```text
formal Phase 47 gate passed
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

Phase 47-1 does not add a new mandatory read-back or runtime step to this
ordering. The existing Phase 46 rule remains authoritative: if successful durable
completion of the `Agent Running` mutation cannot be established, the Agent must
not start. Concrete success-confirmation behavior is a Phase 48 implementation
responsibility.

## Phase 47-1 Scope Boundary

Phase 47-1 defines authorization semantics only. It does not implement or define
the later concrete boundaries for:

```text
repository credential implementation
Agent credential isolation implementation
sandbox implementation
network enforcement
execution_id serialization changes
Phase 46 formal ordering changes
Phase 48 Controller / Worker runtime implementation
```

The later Phase 47 tickets extend this same canonical contract without silently
redefining the Phase 46 execution-input identity or the authorization semantics
established here.
