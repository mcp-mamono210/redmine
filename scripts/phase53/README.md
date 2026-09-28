# Phase 53-3 execution-boundary registry closure runbook

This runbook implements Redmine issue #5450 without changing the Phase 51 strict
validator's existing `pending-first-commit` policy.

## Why Phase 53 uses a two-commit variant

The canonical registry finalization contract describes a pending-first-commit
flow, but the current strict validator permits `pending-first-commit` only for
`system-release-compatibility`. `agent-runner-execution-boundary` therefore uses
the Phase 53 variant below instead of pretending that validator mismatch is
already solved.

## Commit A - contract bytes and closure support

Apply `phase53-3-existing-files.patch` and add the new Phase 53 files from this
package. Do not modify the compatibility registry in Commit A.

Run:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Then commit the contract/ADR/gate/test changes:

```bash
git add \
  docs/contracts/agent-runner-execution-boundary-contract.md \
  docs/adr/ADR-027-use-pull-based-single-worker-agent-controller.md \
  scripts/phase53 \
  tests/unit/phase53-execution-boundary-registry-closure.test.ts \
  .circleci/config.yml

git commit -m "Phase 53-3: execution boundary contract と registry closure gate を確定する refs #5450"
```

Capture Commit A:

```bash
COMMIT_A="$(git rev-parse HEAD)"
```

Commit A alone is intentionally not a final PR state. The Phase 53 closure Gate
must fail until Commit B registers semantic revision 2.

## Commit B - committed registry identity

Immediately after Commit A, with no tracked worktree/index changes and `HEAD == COMMIT_A`, run:

```bash
node scripts/phase53/prepare-agent-runner-execution-boundary-registry-commit.mjs \
  "$COMMIT_A"
```

The command changes only:

```text
docs/contracts/system-release-compatibility-contract-registry.json
```

and sets:

```text
contractId = agent-runner-execution-boundary
semanticRevision = 2
registrationState = committed
sourceRevision = exact Commit A SHA
sourceBlobSha = Git blob SHA of the Commit A contract bytes
```

Verify strict registry validation and the Phase 53 PR-head closure Gate:

```bash
node scripts/phase51/validate-system-release-compatibility.mjs \
  --mode strict \
  --negative-controls

node scripts/phase53/verify-agent-runner-execution-boundary-registry-closure.mjs \
  --mode pre-merge \
  --negative-controls \
  --evidence-out /tmp/phase53-3-pre-merge-closure.json

npm run lint
npm run typecheck
npm run test:unit
```

Commit only the registry change:

```bash
git add docs/contracts/system-release-compatibility-contract-registry.json
git commit -m "Phase 53-3: execution boundary semantic revision 2 を登録する refs #5450"
```

Re-run the closure Gate after Commit B because the exact PR HEAD changed.

## Negative control

`--negative-controls` loads the registry bytes as they existed at Commit A,
combines them with the new contract bytes, and requires closure validation to
FAIL. This proves that a Commit-A-only state with the stale registry cannot pass
the additional Gate. The fixture is in-memory and is not merged.

## Merge method

The registry stores Commit A as canonical history. Use a merge commit. Do not use
squash merge or rebase merge for this branch because either can rewrite away the
Commit A SHA.

If repository protection does not allow merge commits, stop the merge and treat
that as a separate decision. Do not rewrite `sourceRevision` opportunistically.

## Post-merge closure

After the merge commit reaches `main`, check out/update `main` and run:

```bash
node scripts/phase53/verify-agent-runner-execution-boundary-registry-closure.mjs \
  --mode post-merge \
  --negative-controls \
  --evidence-out /tmp/phase53-3-post-merge-closure.json
```

The Gate requires:

```text
Commit A reachable from main HEAD
blob at main HEAD:contract_path
== registry.sourceBlobSha
== blob at registry.sourceRevision:contract_path
strict validator PASS
```

The `/tmp` evidence records preserve the exact checked HEAD SHA, Commit A SHA,
blob identities, strict result, negative-control result, and verification time
without changing the PR/main HEAD that was just verified.
