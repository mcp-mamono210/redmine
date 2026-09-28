# Phase 53-4 production Redmine administrative provisioning

This runbook implements Redmine issue #5451.

The scope is production Redmine administrative configuration only. Actual principal visibility, permission, filter behavior, write/read-back, and
credential-isolation verification remains owned by #5453 (Phase 53-6).

The canonical Agent Brief field semantics remain in:

```text
docs/contracts/agent-brief-redmine-mapping-contract.md
```

The Phase 53-4 machine-readable provisioning specification is:

```text
scripts/phase53/phase53-4-redmine-administrative-provisioning-spec.json
```

It is an operational specification for this ticket, not a replacement canonical
contract.

## Safety model

The provisioning tool has three modes:

```text
inventory -> read only
plan      -> read only, exact before/after plan + digest
apply     -> mutation, only after exact plan digest approval
```

`apply` refuses to run when:

- the approved digest does not match the saved plan;
- production configuration changed after the plan was approved;
- an exact field name is duplicated or has a case-insensitive collision;
- an existing Brief field has the wrong type or multiplicity;
- `Target Repository` is not CF25 with the exact expected name;
- CF25 has multiplicity other than single;
- CF25 has a field format other than the supported existing `string` or `list`
  formats;
- `Agent Brief Lifecycle` contains stored non-canonical values that would be
  invalidated by narrowing the list domain;
- a role selected for restricted visibility does not resolve exactly once; or
- any other plan blocker is present.

The tool does not configure or read an administrator API key. It is intended to
run as an explicit administrative Rails Runner operation on the Redmine host.
Do not copy administrator credentials into Brief Helper, Approval MCP, Runner
Reader, Runner Writer, or generic MCP process configuration.

## Visibility policy requires an explicit choice

Copy the example configuration before planning:

```bash
cp scripts/phase53/phase53-4-redmine-administrative-provisioning.example.json \
  /tmp/phase53-4-redmine-administrative-provisioning.json
```

Both visibility policies initially use:

```text
mode = review-required
```

This intentionally blocks `apply`. Before generating the final plan, choose one
of these modes separately for the six Brief fields and CF25:

```text
all
  -> field is visible to all Redmine roles

roles-additive
  -> preserve existing visible roles and add the exact required role names
     listed in requiredRoleNames
```

`roles-additive` never removes an existing visible role. If an existing field is
already globally visible, it remains globally visible rather than being narrowed.

Do not invent role names. Use the actual production role names selected by the
administrator for the Phase 53 principals. Phase 53-6 later proves that the
principals actually receive the intended visibility and permissions.

## Running in the production Redmine Rails environment

The paths below are examples. Use the real checkout/tool path available to the
Redmine administrator host.

Set common paths:

```bash
export PHASE53_5451_SPEC=/path/to/redmine-mcp/scripts/phase53/phase53-4-redmine-administrative-provisioning-spec.json
export PHASE53_5451_CONFIG=/tmp/phase53-4-redmine-administrative-provisioning.json
export PHASE53_5451_SCRIPT=/path/to/redmine-mcp/scripts/phase53/redmine-administrative-provisioning.rb
```

### 1. Read-only inventory

```bash
PHASE53_5451_MODE=inventory \
PHASE53_5451_OUTPUT=/tmp/phase53-4-inventory.json \
bundle exec rails runner "$PHASE53_5451_SCRIPT"
```

Review the inventory before choosing visibility policy. It records:

- all six Brief fields by exact name;
- exact-match count and case-insensitive collisions;
- type, multiplicity, required/filter flags, allowed values;
- project/tracker scope;
- global or role-restricted visibility;
- nonblank values currently stored for each field;
- `Agent Execution Lifecycle` filter state; and
- CF25 `Target Repository` type, multiplicity, values, scope, and visibility.

No API key or credential material is written to the inventory.

### 2. Generate the exact mutation plan

After explicitly selecting the visibility policy in the config file:

```bash
PHASE53_5451_MODE=plan \
PHASE53_5451_OUTPUT=/tmp/phase53-4-plan.json \
bundle exec rails runner "$PHASE53_5451_SCRIPT"
```

The command prints:

```text
planDigest=sha256:...
blockers=N
actions=N
```

Do not continue when `blockers` is non-zero.

Review the complete `actions` array. It is the exact before/after administrative
mutation proposal required by #5451.

At this point stop and obtain explicit human approval for this exact plan digest.
Do not treat approval of an older plan as approval after any production drift.

### 3. Apply only the approved plan

After the exact plan has been explicitly approved:

```bash
export PHASE53_5451_APPROVED_PLAN_SHA256='sha256:<approved-plan-digest>'
export PHASE53_5451_APPROVED_BY='<human approval identity>'

PHASE53_5451_MODE=apply \
PHASE53_5451_PLAN=/tmp/phase53-4-plan.json \
PHASE53_5451_OUTPUT=/tmp/phase53-4-provisioning-evidence.json \
bundle exec rails runner "$PHASE53_5451_SCRIPT"
```

The tool rebuilds the plan from current production state before mutation. Any
configuration drift changes the digest and stops the apply operation before a
write.

The mutation is performed in one database transaction and followed by a
post-state validation.

## Mutations owned by Phase 53-4

For the six Brief fields, the tool may:

- create a missing exact field only when no exact or case-insensitive collision
  exists;
- set the canonical field format on a newly created field;
- set `is_required = false`;
- require scalar/single-value representation;
- set `Agent Brief Lifecycle` to exactly `Brief Draft`, `Brief Ready`, and
  `Ready for Agent`;
- make `Agent Brief Lifecycle` filterable;
- add project 414 scope without removing existing project scope;
- add the pilot tracker without removing existing tracker scope; and
- apply the explicitly selected visibility policy without silently narrowing
  an existing globally-visible field.

For `Agent Execution Lifecycle`, Phase 53-4 changes only the filter flag needed
for lifecycle filtering. It does not take ownership of the Phase 46 execution
field schema or visibility policy.

For CF25 `Target Repository`, the tool:

- requires exact ID 25 and exact name `Target Repository`;
- records the actual type and multiplicity;
- accepts an existing `string` or `list` type and refuses to change the field
  type;
- requires single-value multiplicity and refuses multiplicity conversion;
- when it is a list field, appends `php` only if missing;
- when it is a string field, treats `php` as a normal future string value and
  does not mutate `possible_values`;
- preserves every existing allowed value;
- adds project/tracker scope without removing existing scope; and
- applies only the explicitly approved visibility policy.

## Evidence and Phase 53-6 handoff

The apply evidence contains the approved plan digest and full sanitized
before/after administrative inventory. It intentionally does not claim that
actual principals can see or mutate the fields.

Phase 53-6 must still verify, from each real credential/host:

- principal identity and non-admin requirements;
- actual field visibility;
- actual lifecycle filtering;
- positive and negative write permissions;
- exact read-back and cleanup; and
- credential isolation.

The Phase 53-4 evidence must therefore record:

```text
principalVerificationOwnedByTicket = 5453
principalVerificationPerformedByThisTool = false
```

## Repository validation

Before committing the Phase 53-4 tooling, follow the repository `AGENTS.md` and
run the applicable repository checks. At minimum the new unit regression must be
included in `npm run test:unit`; run the full required suite when `AGENTS.md`
requires it.
