# Phase 51 operational runbook

This file is non-normative operational documentation. The canonical rules live in
`docs/contracts/system-release-compatibility-contract.md`.

## Registry source-identity refresh

Use this flow whenever the `system-release-compatibility` contract bytes change.
The canonical contract defines the responsibilities and ordering; the commands
below are one concrete implementation.

### 1. Prepare the contract-content state

Update the contract and set its registry entry to the staging state:

```text
semanticRevision = the new semantic revision
sourceBlobSha = Git blob SHA of the changed contract bytes
sourceRevision = null
registrationState = pending-first-commit
```

Verify the staging state before the first commit:

```bash
node scripts/phase51/validate-system-release-compatibility.mjs \
  --mode staging \
  --negative-controls
```

Commit the contract-content state. This commit is the contract source revision:

```bash
git add \
  docs/contracts/system-release-compatibility-contract.md \
  docs/contracts/system-release-compatibility-contract-registry.json \
  scripts/phase51/validate-system-release-compatibility.mjs \
  tests/unit/phase51-release-compatibility-contract.test.ts \
  scripts/phase51/README.md \
  .circleci/config.yml

git commit -m "Harden Phase 51 registry finalization refs #5440"
```

Capture the exact contract-content revision:

```bash
CONTRACT_CONTENT_REVISION="$(git rev-parse HEAD)"
```

### 2. Finalize the registry

Run the repository's current finalization implementation against the exact
contract-content revision:

```bash
node scripts/phase51/finalize-contract-registry.mjs \
  "$CONTRACT_CONTENT_REVISION"
```

The finalizer must verify the contract blob before writing:

```text
sourceRevision = CONTRACT_CONTENT_REVISION
registrationState = committed
```

Then run strict validation:

```bash
node scripts/phase51/validate-system-release-compatibility.mjs \
  --mode strict \
  --negative-controls
```

Run the repository regression set required by #5440:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Commit the finalized registry separately:

```bash
git add docs/contracts/system-release-compatibility-contract-registry.json
git commit -m "Finalize Phase 51 registry identity refs #5440"
```

### 3. Merge without losing the source revision

The first commit above is the value stored in `sourceRevision`. It must remain
reachable in the resulting `main` history. Do not use a merge strategy that
collapses or rewrites away that commit for this flow.

A merge commit that preserves both commits is suitable. The final enforcement is
CI: `main` must pass strict registry validation, including exact Git blob lookup
for every committed local contract entry.

Push the branch only after the finalization commit when possible, so the final PR
state is strict-valid.

## Main-branch strict Gate

`.circleci/config.yml` runs strict registry validation in the setup job before
dynamic CI routing. This makes the Gate apply to documentation-only, normal,
release-candidate, and tag pipelines instead of relying on a selected downstream
verification domain.

A strict failure means the branch/main state is not release-valid. Common causes
include:

- a remaining `pending-first-commit` entry;
- an unknown `registrationState` rejected by schema validation;
- a missing `sourceRevision` commit after history rewriting;
- a contract blob mismatch; or
- a registry `sourceBlobSha` that does not match the referenced bytes.

## Phase 51-2 Redmine MCP RC preparation

Phase 51-2 freezes a Redmine MCP component candidate only after the
verification-support probes below exist. The probes are verification-only and
must not be added to the production startup path or production dependency graph.

### 1. Verify support before freezing RC identity

Build the production implementation and execute the support verification:

```bash
npm run build
node scripts/phase51/verify-redmine-rc-support.mjs
```

This verifies, using production bindings:

- producer field names and lifecycle state from `lifecycle-metadata`;
- canonical constraint vectors against production lifecycle parsing behavior;
- durable Redmine custom-field payload through the production lifecycle boundary
  and `RedmineHttpAgentBriefLifecycleWriter` with an injected capture transport;
- deterministic requirements fingerprint output through the production
  fingerprint implementation;
- current README / CHANGELOG responsibility and version alignment; and
- exact implementation blob identities needed by Phase 51 evidence.

Run normal repository checks before the support commit:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Commit the Phase 51-2 support files before selecting the candidate revision:

```bash
git add \
  scripts/phase51/redmine-producer-profile.mjs \
  scripts/phase51/redmine-durable-handoff-probe.mjs \
  scripts/phase51/redmine-requirements-fingerprint-probe.mjs \
  scripts/phase51/verify-redmine-rc-support.mjs \
  scripts/phase51/generate-redmine-rc-evidence.mjs \
  scripts/phase51/README.md \
  tests/unit/phase51-redmine-rc-support.test.ts

git commit -m "Prepare Redmine MCP Phase 51 RC verification support refs #5435"
```

Freeze that commit as the Redmine MCP RC source revision:

```bash
RC_SOURCE_REVISION="$(git rev-parse HEAD)"
```

### 2. Generate RC identity evidence

Generate identity evidence from the exact support-inclusive candidate revision.
The default released comparison tag for #5435 is `v0.3.0`; pass it explicitly if
repository policy requires an explicit release identity. Ensure release tags are
available in the local clone first.

```bash
git fetch --tags

node scripts/phase51/generate-redmine-rc-evidence.mjs identity \
  --source-revision "$RC_SOURCE_REVISION" \
  --released-tag v0.3.0
```

The generator compares the candidate with the released tag and fails if the
released version is reused after a runtime artifact or Redmine MCP externally
observable component-contract change. It also stores the current required
contract identities from the Phase 51 registry.

Do not commit the evidence yet. The release-quality Gate must execute against
`RC_SOURCE_REVISION`, not an evidence-only follow-up commit.

### 3. Run the canonical release-quality Gate

Push the support commit and run CircleCI for that exact revision with:

```text
ci_execution_context = release_candidate
```

The canonical Gate is defined by the repository CircleCI routing contract. Do
not replace it with a Phase 51-local command list. Record the resulting workflow
or execution reference.

### 4. Generate RC verification evidence

Checkout the exact RC revision, build it, and regenerate/retain the identity
record in the worktree. Then generate verification evidence using the actual
Gate result and raw evidence reference:

```bash
npm run build

node scripts/phase51/generate-redmine-rc-evidence.mjs verification \
  --source-revision "$RC_SOURCE_REVISION" \
  --gate-result PASS \
  --raw-evidence-ref '<CircleCI workflow/execution reference>' \
  --executed-at '<RFC3339 timestamp>'
```

The verification generator requires `HEAD == RC_SOURCE_REVISION`. This prevents
producer/profile/probe evidence from being generated from a different checkout.
It records the production requirements-fingerprint implementation source
identities as full repository / sourceRevision / path / blobSha tuples.

Finally review both canonical records:

```text
docs/verification/phase51-redmine-mcp-rc-identity.json
docs/verification/phase51-redmine-mcp-rc-verification.json
```

and commit them separately from the RC source revision:

```bash
git add \
  docs/verification/phase51-redmine-mcp-rc-identity.json \
  docs/verification/phase51-redmine-mcp-rc-verification.json

git commit -m "Record Redmine MCP Phase 51 RC evidence refs #5435"
```

The evidence commit does not replace `RC_SOURCE_REVISION`. Preserve the support
commit in `main` history so Phase 51-4 can reconstruct and verify the exact RC
checkout referenced by the evidence.
