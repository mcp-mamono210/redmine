# Context Budget

Status: v0.3.0 CI cadence contract; v0.2.0 baseline retained
Target release: v0.3.0
Baseline format version: 1

This document defines the committed Context Budget baseline, regression policy,
local command boundary, normal CI gate, and reproducibility cadence. The
measurement scenarios and numeric baseline remain inherited from v0.2.0 unless
an explicit reviewed baseline update changes them.

## Sources of truth

The Context Budget responsibilities are intentionally split:

| Responsibility | Source of truth |
| --- | --- |
| Machine-readable baseline values | `tests/e2e/context-baseline.json` |
| Scenario execution and collection order | `tests/e2e/context-measurement.test.ts` |
| Serialization and token estimation | `tests/helpers/context-measurement.ts` |
| Regression classification and thresholds | `tests/helpers/context-comparison.ts` |
| Local and CI primitive commands | `package.json` |
| CI enforcement and explicit reproducibility gate | `.circleci/config.yml` |
| Reproducibility cadence | `docs/contracts/ci-reproducibility-execution-contract.md` |

The numeric table below is a human-readable projection of the committed
baseline. The JSON artifact remains authoritative if the two disagree.

## Measurement contract

Measurements run against the deterministic Docker Redmine seed through the
shared MCP E2E Harness with write publication disabled.

The canonical local command:

```text
npm run context:measure
```

performs its own `redmine:reset`, builds the server, and then invokes the narrow
CI primitive:

```text
npm run context:measure:ci
```

`context:measure:ci` performs only measurement and comparison. It assumes the
caller already prepared deterministic Redmine state and compiled server output.
This separation lets CI avoid repeating reset/build setup when a gate explicitly
owns those prerequisites.

Each scenario records three scopes:

| Scope | Measured value |
| --- | --- |
| `total` | The complete JSON-serialized MCP result |
| `content_text` | The concatenated text payload from MCP content entries |
| `structured_content` | The JSON-serialized `structuredContent` payload, or zero when absent |

Each scope records UTF-8 bytes, Unicode characters, and estimated tokens.
Estimated tokens use the fixed reference calculation:

```text
ceil(serialized UTF-8 bytes / 4)
```

This estimate supports deterministic relative comparison. It is not a
model-specific tokenizer, billing calculation, or exact prompt-token count.

For a single response, `items` identifies the returned item count when one is
available and is `1` for detail responses. For workflows, `items` is the number
of MCP calls whose separately serialized results are summed.

## Committed v0.2.0 baseline

| Scenario | Classification | Items / calls | Total bytes | Estimated tokens |
| --- | --- | ---: | ---: | ---: |
| `tools/list` | Tool discovery | 6 | 16476 | 4119 |
| `redmine_get_current_user` | Tool response | 1 | 216 | 54 |
| `redmine_list_issues_10` | Tool response | 3 | 2324 | 581 |
| `redmine_list_issues_20` | Tool response | 3 | 2324 | 581 |
| `redmine_search_10` | Tool response | 1 | 708 | 177 |
| `redmine_search_20` | Tool response | 1 | 708 | 177 |
| `redmine_list_projects_default` | Tool response | 2 | 458 | 115 |
| `redmine_list_projects_max` | Tool response | 2 | 460 | 115 |
| `redmine_get_issue_core` | Tool response | 1 | 1368 | 342 |
| `redmine_get_issue_plus_journals` | Heavy/detail response | 1 | 1678 | 420 |
| `redmine_get_issue_plus_allowed_statuses` | Heavy/detail response | 1 | 1414 | 354 |
| `redmine_get_project_stable_envelope` | Heavy/detail response | 1 | 1856 | 464 |
| `workflow_search_get_issue` | Workflow | 2 | 2076 | 519 |
| `workflow_project_issue_detail` | Workflow | 4 | 6006 | 1502 |

The baseline also stores `content_text` and `structured_content` values for
every scenario. Review the JSON artifact when a component-level delta is
reported.

## Regression policy

All three scopes are compared across all three metrics. A metric is a
regression only when its increase reaches both its absolute threshold and the
percentage threshold.

| Metric | Minimum absolute increase | Minimum percentage increase |
| --- | ---: | ---: |
| UTF-8 bytes | 256 | 5% |
| Unicode characters | 256 | 5% |
| Estimated tokens | 64 | 5% |

If any metric in any scope meets both thresholds, the scenario is classified
as `large_regression`.

| Status | Meaning | Gate result |
| --- | --- | --- |
| `no_meaningful_change` | Baseline and current values are identical | Pass |
| `small_change` | Values differ, but no metric reaches both thresholds | Pass |
| `large_regression` | At least one metric reaches both thresholds | Fail |
| `new_scenario` | Current measurement has no matching baseline scenario | Fail; baseline review required |
| `missing_scenario` | A baseline scenario is absent from the current measurement | Fail; baseline review required |

Context reductions are non-regressing `small_change` results. When a baseline
metric is zero and the current value is positive, the percentage delta is
reported as `n/a`; a large enough absolute increase can still be a regression.

Invalid baseline format, token-estimation metadata, measurement structure,
duplicate scenarios, or invalid policy thresholds fail before a comparison is
accepted.

The gate passes only when:

```text
has_regressions == false
AND
requires_baseline_update == false
```

## Diagnostic and secret boundary

The comparison report contains scenario names, baseline/current token values,
deltas, status, policy values, and affected scope/metric details for large
regressions. It does not print raw MCP responses.

The generated baseline and comparison report are checked against configured
test credentials. A report containing a configured secret fails validation.
Production Redmine data and credentials are outside the measurement contract.

## Commands and update boundary

Verify the current baseline locally without changing it:

```bash
npm run context:measure
```

The command must finish with `Result: PASS`. A failing measurement must not be
made green by automatically replacing the baseline.

When an intentional contract change requires new baseline values, update them
explicitly:

```bash
npm run context:baseline:update
git diff -- tests/e2e/context-baseline.json
npm run context:measure
```

The baseline diff requires human review. Scenario additions, removals, and
renames are contract changes to the measurement set and must not be accepted
implicitly.

`context:measure:ci` is an internal execution primitive. Contributors should use
`context:measure` unless they intentionally own Redmine reset and build setup.

## Normal CI gate

The normal CircleCI `context_budget` job performs exactly one measurement per
pipeline execution:

```text
build
redmine:reset
context:measure:ci
```

This preserves Context Budget regression detection while avoiding a second
unconditional reset/build/measurement on every normal commit.

CI never invokes `context:baseline:update`.

## Reproducibility gate

Context Budget reproducibility remains required as release-quality evidence but
is separated from normal CI cadence.

The explicit repository gate:

```bash
npm run ci:reproducibility
```

runs the Context Budget measurement twice, with a fresh deterministic Redmine
reset before each pass. Both passes use the same build from the same commit and
the same committed baseline.

CircleCI exposes this gate through the opt-in pipeline parameter:

```text
run_reproducibility = true
```

The parameter defaults to `false`. CI-4 owns connecting this gate automatically
to release-candidate and release workflows.

## Release verification

The v0.3.0 release quality gate must retain Context Budget regression
verification and release-oriented reproducibility verification. CI-4 owns the
final workflow routing, but it must not remove either responsibility.

The release is blocked if the Context Budget command fails, the committed
baseline changes without review, the scenario set differs, the report exposes a
configured secret, or the required release gate does not execute the committed
measurement contract.
