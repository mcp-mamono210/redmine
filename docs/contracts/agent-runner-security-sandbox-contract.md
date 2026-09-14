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

Phase 47-2 extends the same canonical contract with:

- Controller ownership of repository-access / source-checkout credentials;
- read-only, minimum-privilege repository credential capability;
- prohibition on credential use before the early allowlist pre-check succeeds;
- isolation of repository, Redmine Writer, and Controller credentials from the
  Agent execution environment;
- prohibition on persisting credential values as execution identity, durable
  execution state, artifact identity, diagnostics, or logs; and
- preservation of the Phase 46 repository / exact-source identity across
  credential handling and later checkout.

Phase 47-3 extends the same canonical contract with:

- one fresh ephemeral sandbox / container per execution attempt;
- a task-scoped writable workspace boundary;
- explicit prohibition of writable host-root, Controller-state, credential-store,
  Docker-socket, unrelated-workspace, and other-execution workspace mounts;
- prohibition on using a shared canonical checkout as an Agent-writable execution
  workspace;
- disposal semantics for success, failure, timeout, and interruption;
- preservation of Redmine as the only durable execution-state Source of Truth;
  and
- mechanically verifiable filesystem / mount isolation requirements.

Phase 47-4 extends the same canonical contract with:

- explicit outbound-network endpoint categories and classification semantics;
- fail-closed handling for security-sensitive network configuration;
- bounded, configurable execution timeout and resource-capture limits;
- reuse of the existing Phase 45 `timeout` outcome without implicit taxonomy
  extension;
- secret non-exposure as the primary protection boundary;
- redaction before external persistence of output, logs, diagnostics, and
  artifact metadata; and
- a deterministic non-production secret fixture contract for Phase 50.

Phase 47-5 performs the final Phase 46 handoff / Phase 48 entry consistency
verification for this canonical contract.

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

## Phase 47-2 Source Checkout Credential Ownership

Repository access used for exact-source resolution and later source checkout is
a Controller responsibility. The repository credential is owned and applied by
the Controller-side repository-access boundary, not by the Agent process or the
Agent sandbox.

The logical ownership path is:

```text
Controller
    |
    v
read-only repository credential
    |
    v
early allowlist pre-check passed repository only
    |
    +--> exact source revision resolution, when repository access is required
    |
    +--> later checkout of the already-fixed exact source revision
```

The Controller must not use the repository credential for a candidate until the
early allowlist pre-check has positively authorized the unchanged Phase 46
repository identity. An unauthorized, unknown, indeterminate, unavailable, or
invalid allowlist result therefore prevents credentialed repository access.

This ownership rule does not move actual source checkout earlier in the Phase 46
/ Phase 48 ordering. Phase 47-2 defines who may hold and apply the credential;
Phase 48 owns the concrete repository client, fetch / checkout sequence, and
runtime placement of the checkout operation.

## Repository Credential Capability

The repository credential must be provisioned with the minimum capability needed
to read the authorized repository and obtain the already-selected execution
source. At the logical contract level, the required capability is limited to:

```text
read repository metadata needed by the repository client
resolve refs when exact-source determination requires it
fetch objects required for the selected source
checkout the already-fixed exact source revision
```

The credential must not require or intentionally grant repository write or
administrative capability, including:

```text
Git push
branch creation or update
tag creation or update
repository administration
repository settings changes
webhook administration
permission administration
```

"Read-only" is a capability requirement, not a particular provider-specific
scope name. Phase 47-2 does not choose GitHub, GitLab, SSH, HTTPS, a token type,
or a secret-backend product. Deployment-specific credentials must be mapped to
the provider's least-privilege read capability.

If the configured credential is missing, unavailable, invalid, cannot establish
the required read capability, or is known to require write / administrative
privilege for the configured access path, the system must fail closed rather
than broaden the credential silently.

## Agent Credential Isolation

The repository credential used by the Controller must not be inherited by or
mounted into the Agent execution environment. The Agent must not receive or be
able to read any of the following through environment inheritance, files,
mounts, helper configuration, credential stores, or equivalent mechanisms:

```text
Git remote write credential
Controller repository-access credential
Redmine Writer credential
Controller control-plane credential
unrelated repository credential
host credential store
```

The Agent may receive only credentials that a later explicit contract identifies
as necessary for Agent execution. Phase 47-2 does not implicitly authorize any
such credential and does not treat Controller credential availability as Agent
credential availability.

Repository access for source preparation therefore follows the preferred
boundary:

```text
Controller authenticates to repository
    |
    v
Controller prepares task-scoped source / workspace
    |
    v
Agent receives the prepared execution workspace

Agent does not receive the Controller repository credential
```

This contract does not require the Agent to perform authenticated remote Git
operations during normal v0.4.0 execution.

## Credential Persistence Boundary

Credential values are secret-bearing runtime inputs, not execution identity and
not durable execution state. A credential value, token, password, private key,
signed repository URL, or equivalent secret material must not be written into:

```text
execution input identity
immutable execution input snapshot
Redmine execution / rejection record
artifact identity or artifact reference
diagnostic text
logs intended for durable or external persistence
```

The durable repository identity remains the non-secret Phase 46 canonical
repository identity. A credential-bearing clone URL must not be substituted for
that identity in Redmine or an artifact record.

Phase 47-2 does not define the concrete secret backend, environment-variable
name, file path, token format, or credential rotation mechanism. Those are
deployment / implementation concerns subject to this non-exposure boundary and
the later Phase 47 secret-handling contract.

## Exact Source Preservation Across Credential Handling

Credential handling must not reinterpret or replace the Phase 46 repository
identity. The same unchanged repository identity that passed the early pre-check
and formal gate remains the repository identity for the execution.

Before the formal gate, a Controller-side repository read may resolve a moving
source selector to the exact source revision only as permitted by the Phase 46
exact-source contract. After the exact source revision is fixed and the formal
gate succeeds, later credential use and actual checkout must use that fixed
identity:

```text
Phase 46 repository identity
+
fixed exact source revision
    |
    v
formal Phase 47 gate passed
    |
    v
later Controller checkout uses the same repository + exact revision
```

The later checkout must not re-resolve `main`, another branch, a tag, `HEAD`, or
a mutable convenience reference and silently substitute a different source
revision. Credential refresh, credential rotation, repository-client retry, or
checkout retry is not permission to retarget the execution.

## Repository Access / Checkout Failure Boundary

Repository access failure must never be converted into permission to start the
Agent.

Failures that occur while exact source revision is still being established are
pre-execution failures under the existing Phase 46 contract. Examples include:

```text
repository credential unavailable
repository authentication failure
required read permission unavailable
repository cannot be read safely
exact source revision cannot be resolved from the authorized repository
```

When such a failure occurs before the Phase 47 formal gate / `execution_id`
allocation boundary, the existing pre-execution routing remains authoritative:

```text
Agent = not started
lifecycle target = Needs Human
outcome = eligibility_failed
execution_id = not allocated
```

Actual source checkout is a Phase 48 runtime responsibility. If a later checkout
fails after an execution attempt has already crossed the `execution_id` /
`Agent Running` boundary, Phase 47-2 still requires that the Agent process not be
started with missing, partial, ambiguous, or differently resolved source. That
case must not be rewritten as an execution-ID-less pre-execution rejection.
Phase 48 owns the concrete started-execution failure / recovery handling under
the existing Phase 45 outcome taxonomy.

Phase 47-2 adds no new durable outcome identity for repository-client,
credential, or checkout failure. If implementation later requires a new durable
outcome, the existing Phase 45 / Phase 46 contract and ADR review boundary
applies.

## Phase 47-2 Scope Boundary

Phase 47-2 fixes credential ownership, minimum privilege, non-exposure,
persistence, source-identity preservation, and no-Agent-start safety semantics.
It deliberately does not implement or choose:

```text
actual repository client implementation
actual fetch / checkout implementation
credential backend or secret-backend product
provider-specific token / key type
Agent invocation
Git remote push
Controller runtime implementation
sandbox mount implementation
runtime retry / recovery implementation
```

Those implementation choices remain downstream, primarily Phase 48, and must
consume the credential contract defined here without weakening the Phase 47-1
authorization boundary or Phase 46 execution-input identity.

## Phase 47-3 Sandbox Identity

Agent execution uses an execution-scoped ephemeral sandbox boundary. The
canonical identity rule is:

```text
1 execution attempt
=
1 fresh ephemeral sandbox / container
```

A sandbox created for one execution attempt must not be reused as the mutable
execution environment for another attempt. Two execution attempts must not share
one mutable sandbox, container filesystem, or task workspace as execution
authority.

The sandbox is an isolation boundary for the Agent process. It is not an
execution identity, durable execution record, retry identifier, or Source of
Truth. Phase 47-3 does not change the Phase 46 `execution_id` allocation
boundary or the Phase 47 formal authorization / security gate ordering.

Phase 48 owns the concrete container/runtime mechanism and the exact point at
which the sandbox is created. That implementation must preserve the one-attempt /
one-sandbox isolation rule defined here.

## Task-scoped Workspace Boundary

The Agent's host-backed writable execution workspace is task-scoped to one
execution attempt. The minimum filesystem classification is:

```text
task-scoped workspace
  = writable for the execution

source checkout
  = located inside the task-scoped execution workspace

Controller state
  = unavailable to the Agent

credential store
  = unavailable to the Agent

host root filesystem
  = not writable through an Agent sandbox mount

Docker socket
  = unavailable to the Agent

unrelated repository workspace
  = unavailable to the Agent

other execution workspace
  = unavailable to the Agent
```

The task-scoped workspace may contain the prepared source tree for the exact
Phase 46 repository / source-revision identity. It must not authorize changing
that identity or re-resolving a mutable source selector.

A shared canonical checkout, shared working tree, Controller-owned repository
cache, or other mutable shared source directory must not be exposed as the
Agent-writable execution workspace. If Phase 48 uses a cache or shared source
material internally, the Agent-writable execution view must still be isolated
into the execution's task-scoped workspace.

This boundary does not require every filesystem inside the sandbox to be
read-only. Ephemeral container-local filesystems may be writable as required by
the runtime. The host-isolation requirement is that writable host-backed mounts
made available to the Agent are limited to the execution's task-scoped
workspace.

## Forbidden Host Mounts and Interfaces

The Agent sandbox must not be given any of the following host-backed writable
mounts or privileged interfaces:

```text
host root filesystem write mount
Controller directory write mount
credential store mount
Docker socket mount
unrelated repository workspace write mount
other execution workspace write mount
```

A read-only mount is not automatically safe merely because it is read-only.
Controller state, credential stores, Docker / container-engine control sockets,
and unrelated or other-execution workspaces remain unavailable unless a later
explicit security contract deliberately changes that classification.

In particular, the Docker socket or an equivalent host container-engine control
socket must not be exposed to the Agent. Otherwise the sandbox boundary could be
bypassed by controlling host-level containers.

The Agent must not obtain Controller credentials indirectly through mounts,
credential helpers, shell initialization, repository helper configuration, or a
host credential store. This filesystem rule complements, and does not weaken,
the Phase 47-2 credential-isolation contract.

## Sandbox Lifecycle and Disposal

The sandbox and task-scoped workspace are transient execution resources. They
must be disposable after each of the following terminal / interruption classes:

```text
success
failure
timeout
interruption
```

"Disposable" means that the durable meaning of the execution does not depend on
preserving the sandbox, container, process namespace, or writable workspace for
later workflow decisions. A later execution must not require reuse of the prior
sandbox in order to recover the prior execution identity or lifecycle state.

The concrete lifecycle operations are Phase 48 responsibilities, including:

```text
container start / stop
container removal
process termination
workspace cleanup
orphan detection / cleanup
cleanup retry / recovery
```

Phase 47-3 does not prescribe a container runtime, cleanup command, filesystem
layout, or retention implementation. It defines the security invariant that
cleanup is possible and that cleanup failure must not promote transient sandbox
state into a durable execution authority.

## Durable State Boundary

The Phase 45 / Phase 46 Source-of-Truth model remains unchanged:

```text
Redmine
=
only durable execution-lifecycle / current execution-state Source of Truth

workspace / container / sandbox
=
transient execution resources
```

A local sandbox, task workspace, marker file, container label, PID, or runtime
cache may support Phase 48 execution mechanics but must not become a second
durable execution-state ledger.

Likewise, sandbox survival after a crash or cleanup failure does not prove that
an execution is running, completed, retryable, or safe to resume. Durable
workflow decisions must be reconstructed from the canonical Redmine execution
state and the later artifact contract, not inferred from leftover transient
resources alone.

Phase 49 may define a durable change artifact in private S3, but that artifact
is not a replacement execution-lifecycle Source of Truth and does not alter the
Phase 47-3 sandbox boundary.

## Mechanical Verification Boundary

The sandbox isolation contract must be testable from concrete runtime
configuration rather than relying on an unprovable absolute claim such as
"the Agent can never modify the host."

At minimum, Phase 48 / Phase 50 must be able to establish mechanically that:

```text
task-scoped workspace is the only host-backed writable mount presented to the
Agent sandbox

host root is not presented as a writable mount

Controller directories are not presented as writable mounts

credential stores are not mounted into the Agent sandbox

Docker / container-engine control socket is not mounted into the Agent sandbox

unrelated repository workspaces are not presented as writable mounts

other execution workspaces are not presented as writable mounts
```

The preferred acceptance statement is therefore:

```text
task-scoped workspace 以外の host filesystem が
writable mount として Agent sandbox に提供されていない
```

Verification may inspect the sandbox launch specification, mount table,
container configuration, or equivalent runtime evidence. Phase 47-3 fixes the
observable invariants; Phase 48 owns enforcement and Phase 50 owns deterministic
regression coverage.

## Phase 47-3 Scope Boundary

Phase 47-3 fixes sandbox identity, host filesystem / mount isolation, transient
lifecycle, durable-state separation, and mechanically verifiable isolation
semantics. It deliberately does not implement or choose:

```text
authorization / repository allowlist semantics
actual container runtime or launch implementation
Controller / Worker implementation
local duplicate-prevention lock
container stop / remove implementation
workspace cleanup / orphan cleanup implementation
network policy or network enforcement
timeout timer / process-kill implementation
Agent Adapter / Agent invocation
artifact manifest / patch / persistence
```

Those implementation choices remain downstream. In particular, Phase 48 owns
sandbox creation and cleanup mechanics, while later Phase 47 work owns network,
resource, timeout, and secret-handling policy. No Phase 47-3 rule changes the
Phase 46 execution-input identity, Phase 47 authorization ordering, or Phase
47-2 credential-isolation boundary.

## Phase 47-4 Outbound Network Boundary

Agent Runner must not treat unrestricted outbound network access as an implicit
runtime capability. Every outbound endpoint used by the Controller, Worker,
Agent sandbox, Agent Adapter, or related execution path must be covered by an
explicit endpoint-category policy before the relevant component is permitted to
use it.

The minimum endpoint categories are exactly:

```text
Agent provider
package registry
required runtime dependency
source repository
other external endpoint
```

Each category must resolve to exactly one of these logical classifications:

```text
required
allowed
denied
configuration-driven
```

The classifications mean:

- `required`: the declared endpoint set is necessary for the selected execution
  mode; inability to use the declared endpoint prevents the dependent operation
  from proceeding;
- `allowed`: the declared endpoint set may be used but is not required for every
  execution;
- `denied`: the category is not permitted outbound access in that execution
  context; and
- `configuration-driven`: deployment / execution-mode configuration must resolve
  the category to an explicit bounded endpoint policy before use. Missing,
  invalid, ambiguous, or unresolved configuration is not authorization.

For v0.4.0, the logical baseline is:

| Endpoint category | Baseline classification | Boundary |
| --- | --- | --- |
| `Agent provider` | `configuration-driven` | only explicitly configured provider endpoints may be used by the component that owns provider invocation |
| `package registry` | `configuration-driven` | access is permitted only when explicitly required / allowed by the selected runtime or task policy |
| `required runtime dependency` | `configuration-driven` | only explicitly declared runtime dependencies may receive network access |
| `source repository` | `configuration-driven` | repository access is primarily Controller-side and remains subject to Phase 47-1 allowlist and Phase 47-2 credential boundaries |
| `other external endpoint` | `denied` | no catch-all external access is granted by default |

`configuration-driven` is not equivalent to `allowed`. It is a requirement to
resolve an explicit policy. An unresolved category fails closed rather than
falling back to unrestricted egress.

The endpoint set for an allowed / required category must itself be bounded and
explicit enough to enforce mechanically. A wildcard that effectively means
"the public Internet" does not satisfy this contract merely because it appears
in configuration.

### Source repository network boundary

Normal source-repository authentication, ref resolution, fetch, and exact-source
checkout are Controller-side responsibilities under the Phase 47-1 / Phase 47-2
contracts. The Agent sandbox does not gain repository network access merely
because the Controller is allowed to access the source repository.

If a later execution mode needs Agent-side source-repository access, that access
must be introduced as an explicit policy change with its own authorization,
credential, and network classification. Phase 47-4 does not grant it
implicitly.

Repository network handling must continue to preserve all upstream invariants:

```text
early allowlist pre-check before credentialed repository access
exact source revision fixed before the formal Phase 47 gate
no mutable-ref re-resolution after the formal gate
Controller repository credential not exposed to the Agent
```

## Network Fail-closed Boundary

Security-sensitive network policy is fail closed.

At minimum, the following conditions must not produce unrestricted outbound
access:

```text
network policy configuration is missing
network policy configuration is unreadable
network policy configuration is syntactically invalid
endpoint classification is unknown or ambiguous
configuration-driven category cannot be resolved
endpoint set is empty when a required endpoint is needed
endpoint set expands to an unbounded / unrestricted destination set
network-policy evaluation fails
```

A failure to establish the intended network policy is not permission to start or
continue with open egress. Phase 47-4 defines this policy invariant only. The
actual firewall, proxy, container-network, DNS, egress-filter, or equivalent
enforcement implementation belongs to Phase 48.

This network boundary does not create a new durable execution outcome. Runtime
failures must use the existing Phase 45 outcome taxonomy unless an explicit
Phase 45 contract / ADR change is approved.

## Resource Boundary

Execution resources must be bounded and configurable. The canonical contract
requires at least the following independent limits:

```text
execution timeout
bounded output capture
bounded diagnostic capture
bounded workspace disk usage
container lifecycle limit
```

Phase 47-4 fixes the properties of those limits, not arbitrary production
numbers. The contract therefore does not hard-code a timeout duration, byte
count, disk quota, or container lifetime without an operational basis.

### Execution timeout

The execution timeout must resolve to a finite positive configured value before a
started Agent execution depends on it. Production configuration may provide a
default, project-specific value, or bounded policy range, but an invalid,
unbounded, or indeterminate timeout must not silently become "no timeout".

The timeout is an execution safety limit, not an execution identity input. It
must not alter the Phase 46 repository, source revision, Brief identity,
requirements fingerprint, or `execution_id` semantics.

### Output and diagnostic capture

Execution output capture and diagnostic capture must each have an explicit
finite bound. An implementation may bound bytes, characters, records, events,
or another mechanically enforceable unit, but it must not retain unbounded
Agent output in memory or durable storage merely because the Agent continues to
produce data.

When content exceeds the configured capture boundary, downstream implementation
must preserve a bounded representation and an observable truncation / limit
fact rather than pretending that the capture was complete. Concrete
serialization is a Phase 48 / Phase 49 implementation concern.

### Workspace disk boundary

The task-scoped workspace defined by Phase 47-3 must have a finite disk-usage
boundary or an equivalent mechanically enforceable storage limit. The limit may
be deployment-configurable, but "consume host disk until exhaustion" is not a
valid default policy.

The disk boundary must preserve the Phase 47-3 invariant that only the
execution-scoped workspace is Agent-writable host-backed storage. A larger quota
must not widen the mount boundary.

### Container lifecycle limit

A sandbox / container must have a bounded execution lifecycle and must not be
permitted to remain an indefinitely running execution resource merely because a
cleanup path failed or no result was produced.

The configured lifecycle limit may account for execution, termination, and
cleanup phases, but the exact timer model and grace periods are Phase 48
implementation details. The durable meaning of the execution remains in
Redmine, not in the continued existence of a container.

## Timeout Outcome Compatibility

The current Phase 45 canonical execution boundary contract was re-checked during
Phase 47-4 and already contains `timeout` in the canonical execution outcome
identity set:

```text
changes_ready
no_changes
stale_requirements
eligibility_failed
interrupted
timeout
agent_start_failed
agent_failed
artifact_persistence_failed
```

Phase 47-4 therefore reuses the existing `timeout` outcome. It does not add a
Phase 47-specific timeout outcome and does not extend the Phase 45 taxonomy
implicitly.

If, at implementation or later verification time, `timeout` is absent, its
meaning has changed, or the canonical taxonomy cannot be established, work must
stop at the contract boundary and explicitly review / update, as applicable:

```text
Phase 45 canonical execution boundary contract
Phase 45 execution outcome taxonomy
required ADR / architecture decision
```

A local runtime implementation must not invent a substitute outcome to bypass
that review.

Phase 47-4 defines only the timeout / resource contract. Phase 48 owns the
concrete runtime behavior, including:

```text
timer implementation
process termination / process kill
container termination and cleanup
workspace cleanup / orphan handling
Redmine result mutation
retry / recovery behavior
```

## Secret Non-exposure Boundary

The primary secret-protection mechanism is non-exposure, not redaction after the
fact:

```text
do not provide credentials / secrets to the Agent unless they are explicitly
required and authorized for that execution boundary
```

Phase 47-2 already forbids exposing Controller repository credentials, Redmine
Writer credentials, Controller control-plane credentials, unrelated repository
credentials, and host credential stores to the Agent. Phase 47-4 preserves and
extends that principle to any other secret-bearing runtime value.

A secret needed by one trusted component does not become an Agent-visible secret
merely because both components participate in the same execution. Availability
must remain component-scoped and least-privilege.

Phase 47-4 does not authorize a new Agent-visible secret category and does not
select a production secret-management product or credential backend.

## Redaction Before External Persistence

Defense in depth requires a redaction boundary before potentially secret-bearing
text or metadata is persisted outside the transient execution boundary.

At minimum, the redaction boundary covers:

```text
execution output
exported / durable log content
diagnostic content
artifact metadata
```

The detailed Phase 49 artifact-content contract remains out of scope here.
Phase 47-4 only requires that metadata and exported textual capture crossing an
external persistence boundary be processed by the defined redaction boundary.

Redaction must occur before writing the affected representation to an external
or durable sink such as Redmine, private S3 metadata, or an external log sink.
Persisting the raw secret-bearing representation first and redacting a later copy
does not satisfy this contract.

Redaction is not permission to expose secrets broadly. Non-exposure remains the
primary defense, and redaction is a secondary persistence boundary. If a
potentially secret-bearing representation cannot be processed under the active
redaction policy, the implementation must not fall back to persisting the raw
representation. Concrete failure routing belongs to the downstream runtime /
artifact implementation and must reuse existing outcome contracts unless those
contracts are explicitly changed.

## Deterministic Secret Fixture Contract

Phase 50 must be able to verify the secret boundary deterministically without any
real credential and without requiring a live external AI provider.

The minimum deterministic fixture flow is:

```text
known non-production fixture secret
    |
    v
fixture is intentionally made visible to the deterministic test Agent / adapter
    |
    v
Agent-visible or generated output contains the fixture secret
    |
    v
output / log / diagnostic / artifact-metadata persistence boundary
    |
    v
redaction
    |
    v
externally persisted representation does not contain the fixture secret
```

The fixture secret must be a synthetic value reserved for tests. It must not be a
real repository token, Redmine API key, provider credential, cloud credential,
password, private key, or copied production secret.

Phase 50 regression coverage must be able to assert at least that:

```text
the exact fixture secret is absent from every tested externally persisted
representation after the redaction boundary
```

The deterministic adapter / fixture may deliberately echo the synthetic secret
in controlled test output so the regression proves the redaction boundary rather
than merely proving that the fixture was never present.

This fixture contract defines the observable security property. It does not
mandate a particular redaction library, pattern engine, secret scanner, or
production credential store.

## Phase 47-4 Scope Boundary

Phase 47-4 fixes network classification, fail-closed network policy, bounded
resource / timeout semantics, existing `timeout` outcome compatibility, secret
non-exposure, persistence redaction, and deterministic secret-fixture semantics.
It deliberately does not implement or choose:

```text
network enforcement implementation
firewall / proxy / container-network implementation
timer implementation
process termination / process-kill implementation
container cleanup implementation
workspace cleanup / orphan cleanup implementation
Redmine result mutation implementation
external AI provider use in normal CI
artifact content contract details
production secret-management product or credential backend
redaction library / scanner implementation
```

Those implementation choices remain downstream. Phase 48 owns runtime
enforcement and timeout / termination mechanics. Phase 49 owns the detailed
artifact content / persistence contract. Phase 50 owns deterministic regression
coverage. No Phase 47-4 rule changes the Phase 46 immutable execution-input
identity, the Phase 47 authorization ordering, the Phase 47-2 credential
isolation boundary, or the Phase 47-3 sandbox / mount boundary.

