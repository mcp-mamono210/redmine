# Context Budget

Status: v0.3.0 Agent Brief public-surface integration; v0.2.0 read baseline retained
Target release: v0.3.0
Baseline format version: 1
Agent Brief public-surface budget format version: 1

This document defines the committed Context Budget baseline, the additive
Agent Brief public-surface budget introduced by Phase 42-3, and the normal / release
CI routing boundary.

The v0.2.0 deterministic read-only baseline remains unchanged. Phase 42-3 does
not replace that baseline or change its regression thresholds. Instead, it adds
an explicit v0.3.0 budget overlay for the new write-enabled Agent Brief approval
surface so that the actual public addition is measured without redefining the
existing read-only measurement contract.

## Sources of truth

| Responsibility | Source of truth |
| --- | --- |
| Machine-readable read-only baseline | `tests/e2e/context-baseline.json` |
| Read-only measurement scenarios | `tests/e2e/context-measurement.test.ts` |
| Agent Brief public-surface budget | `tests/e2e/agent-brief-public-surface-budget.json` |
| Agent Brief public-surface measurement | `tests/e2e/agent-brief-public-surface-context-budget.test.ts` |
| Serialization / estimate | `tests/helpers/context-measurement.ts` |
| Read-only regression policy | `tests/helpers/context-comparison.ts` |
| Final Agent Brief public MCP surface | `docs/contracts/agent-brief-public-mcp-surface-contract.md` |
| Local / CI commands | `package.json` |
| CI routing | `.circleci/config.yml`, `.circleci/continue_config.yml` |
| Reproducibility cadence | `docs/contracts/ci-reproducibility-execution-contract.md` |
| Release gate | `docs/contracts/ci-release-gate-contract.md` |

## Measurement command boundary

Canonical local verification:

```text
npm run context:measure
```

performs:

```text
redmine:reset
build
context:measure:ci
```

`context:measure:ci` assumes deterministic Redmine state and compiled server
output already exist. It runs both:

```text
read-only baseline comparison
Agent Brief public-surface budget regression
```

`context:baseline:update` remains local-only and requires human review. It may
update the committed read-only baseline, but it does not rewrite the Agent Brief
public-surface budget ceilings.

## Read-only regression policy

The committed v0.2.0 baseline, scenario set, byte/character/token estimate
policy, thresholds, secret checks, and baseline update policy remain unchanged.

The read-only gate passes only when:

```text
has_regressions == false
AND
requires_baseline_update == false
```

## Agent Brief public-surface budget

Phase 42-3 measures only the public surface that actually exists after Phases 40
and 41. The measurement does not invent additional Agent Brief Tools.

The measured scenarios are:

```text
agent_brief_write_tools_list_delta
agent_brief_approval_tool_definition
agent_brief_approval_output_schema
agent_brief_approval_approved_response
agent_brief_approval_public_workflow
```

The write-enabled `tools/list` scenario is compared with the same server started
with write publication disabled. The delta therefore represents the cost of the
single published `redmine_approve_agent_brief` surface rather than charging the
existing six read-only Tools a second time.

The Tool-definition scenario includes the actual published input schema,
`outputSchema`, annotations, and description returned by MCP `tools/list`.

The representative approved-response scenario uses the same public adapter that
produces `content[0].text` and `structuredContent`, with deterministic synthetic
identifiers and fingerprints. It does not mutate Redmine.

The representative workflow combines the published approval Tool definition
with one successful public approval response. This measures the context a client
must carry to understand and consume the explicit approval operation.

Machine-readable maximums are committed in:

```text
tests/e2e/agent-brief-public-surface-budget.json
```

The same UTF-8 byte / character / estimated-token model used by the existing
Context Budget measurement is used for this overlay. A measured scenario that
exceeds any committed maximum fails the Context Budget job.

Changing a maximum is an explicit reviewed repository change. CI does not
self-adjust the public-surface budget.

## Normal CI

CI-1 determines whether a normal change requires `context_budget`.

When selected, CI-4 runs the existing single-pass Context Budget job:

```text
build
redmine:reset
context:measure:ci
```

Because `context:measure:ci` now includes the Agent Brief public-surface
regression, a change to the published approval Tool can no longer pass the
Context Budget job while only the old read-only surface is measured.

Ordinary documentation that does not select `context_budget` may skip this job.
Unknown or ambiguous normal changes fail safe to the full normal domain set and
therefore include Context Budget verification.

## Reproducibility

The explicit gate:

```text
npm run ci:reproducibility
```

runs Context Budget twice from fresh deterministic resets.

Both passes execute the read-only baseline comparison and the Agent Brief
public-surface budget regression through the canonical `context:measure:ci`
primitive.

For normal CI this remains optional unless explicitly requested.

## Release candidate / release

Context Budget is mandatory for both execution contexts and cannot be removed by
normal changed-file classification.

The release workflow contains:

```text
context_budget
reproducibility
```

and the final `release_gate` requires both along with the other full-gate
verification jobs.

A read-only baseline regression or an Agent Brief public-surface budget
regression therefore prevents a successful release gate.

## Baseline and budget safety

No normal, reproducibility, release-candidate, or release CI workflow invokes:

```text
context:baseline:update
```

An intentional read-only baseline change remains an explicit reviewed repository
change.

The Agent Brief public-surface budget has no automatic update command. Changing
its ceilings requires a normal reviewed edit to:

```text
tests/e2e/agent-brief-public-surface-budget.json
```

This keeps both the inherited baseline and the v0.3.0 public-surface budget under
explicit human review.
