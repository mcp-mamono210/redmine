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