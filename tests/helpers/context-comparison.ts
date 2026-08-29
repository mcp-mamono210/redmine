import { z } from "zod";

import {
  CONTEXT_BASELINE_FORMAT_VERSION,
  TOKEN_ESTIMATE_BYTES_PER_TOKEN,
  type ContextBaseline,
  type ContextMeasurement,
  type ContextSize,
} from "./context-measurement.js";

const CONTEXT_SCOPES = [
  "total",
  "content_text",
  "structured_content",
] as const;

const CONTEXT_METRICS = [
  "bytes",
  "characters",
  "estimated_tokens",
] as const;

type ContextScope = (typeof CONTEXT_SCOPES)[number];
type ContextMetric = (typeof CONTEXT_METRICS)[number];

export interface ContextRegressionPolicy {
  minimum_absolute_increase: Record<ContextMetric, number>;
  minimum_percentage_increase: number;
}

export const DEFAULT_CONTEXT_REGRESSION_POLICY = {
  minimum_absolute_increase: {
    bytes: 256,
    characters: 256,
    estimated_tokens: 64,
  },
  minimum_percentage_increase: 5,
} as const satisfies ContextRegressionPolicy;

export interface ContextMetricComparison {
  baseline: number;
  current: number;
  absolute_delta: number;
  percentage_delta: number | null;
  threshold: {
    absolute: number;
    percentage: number;
  };
  is_regression: boolean;
}

export type ContextScopeComparison = Record<
  ContextMetric,
  ContextMetricComparison
>;

export type ContextScenarioStatus =
  | "no_meaningful_change"
  | "small_change"
  | "large_regression"
  | "new_scenario"
  | "missing_scenario";

export interface ContextScenarioComparison {
  scenario: string;
  status: ContextScenarioStatus;
  scopes?: Record<ContextScope, ContextScopeComparison>;
}

export interface ContextComparisonResult {
  policy: ContextRegressionPolicy;
  scenarios: ContextScenarioComparison[];
  has_regressions: boolean;
  requires_baseline_update: boolean;
}

export class ContextBaselineError extends Error {}
export class ContextMeasurementError extends Error {}
export class ContextComparisonSecurityError extends Error {}

const contextSizeSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    estimated_tokens: z.number().int().nonnegative(),
  })
  .strict();

const contextMeasurementSchema = z
  .object({
    scenario: z.string().min(1),
    items: z.number().int().nonnegative(),
    total: contextSizeSchema,
    content_text: contextSizeSchema,
    structured_content: contextSizeSchema,
  })
  .strict();

const contextBaselineSchema = z
  .object({
    format_version: z.literal(
      CONTEXT_BASELINE_FORMAT_VERSION,
    ),
    token_estimate: z
      .object({
        method: z.literal(
          "utf8_bytes_divided_by_4_rounded_up",
        ),
        bytes_per_token: z.literal(
          TOKEN_ESTIMATE_BYTES_PER_TOKEN,
        ),
      })
      .strict(),
    scenarios: z.array(contextMeasurementSchema),
  })
  .strict();

function assertUniqueScenarios(
  measurements: ContextMeasurement[],
  createError: (message: string) => Error,
): void {
  const scenarioNames = measurements.map(
    ({ scenario }) => scenario,
  );

  if (new Set(scenarioNames).size !== scenarioNames.length) {
    throw createError("Context scenarios must be unique");
  }
}

export function parseContextBaseline(
  value: unknown,
): ContextBaseline {
  const result = contextBaselineSchema.safeParse(value);

  if (!result.success) {
    throw new ContextBaselineError(
      "Context baseline schema mismatch",
    );
  }

  assertUniqueScenarios(
    result.data.scenarios,
    (message) => new ContextBaselineError(message),
  );

  return result.data;
}

function parseCurrentMeasurements(
  value: unknown,
): ContextMeasurement[] {
  const result = z.array(contextMeasurementSchema).safeParse(value);

  if (!result.success) {
    throw new ContextMeasurementError(
      "Current context measurement schema mismatch",
    );
  }

  assertUniqueScenarios(
    result.data,
    (message) => new ContextMeasurementError(message),
  );

  return result.data;
}

function validatePolicy(policy: ContextRegressionPolicy): void {
  const thresholds = [
    ...Object.values(policy.minimum_absolute_increase),
    policy.minimum_percentage_increase,
  ];

  if (
    thresholds.some(
      (threshold) =>
        !Number.isFinite(threshold) || threshold < 0,
    )
  ) {
    throw new ContextMeasurementError(
      "Context regression thresholds must be finite non-negative numbers",
    );
  }
}

function compareMetric(
  baseline: number,
  current: number,
  absoluteThreshold: number,
  percentageThreshold: number,
): ContextMetricComparison {
  const absoluteDelta = current - baseline;
  const percentageDelta =
    baseline === 0
      ? current === 0
        ? 0
        : null
      : (absoluteDelta / baseline) * 100;
  const percentageThresholdReached =
    baseline === 0
      ? current > 0
      : percentageDelta !== null &&
        percentageDelta >= percentageThreshold;

  return {
    baseline,
    current,
    absolute_delta: absoluteDelta,
    percentage_delta: percentageDelta,
    threshold: {
      absolute: absoluteThreshold,
      percentage: percentageThreshold,
    },
    is_regression:
      absoluteDelta > 0 &&
      absoluteDelta >= absoluteThreshold &&
      percentageThresholdReached,
  };
}

function compareScope(
  baseline: ContextSize,
  current: ContextSize,
  policy: ContextRegressionPolicy,
): ContextScopeComparison {
  return Object.fromEntries(
    CONTEXT_METRICS.map((metric) => [
      metric,
      compareMetric(
        baseline[metric],
        current[metric],
        policy.minimum_absolute_increase[metric],
        policy.minimum_percentage_increase,
      ),
    ]),
  ) as unknown as ContextScopeComparison;
}

function compareScenario(
  baseline: ContextMeasurement,
  current: ContextMeasurement,
  policy: ContextRegressionPolicy,
): ContextScenarioComparison {
  const scopes = Object.fromEntries(
    CONTEXT_SCOPES.map((scope) => [
      scope,
      compareScope(baseline[scope], current[scope], policy),
    ]),
  ) as unknown as Record<ContextScope, ContextScopeComparison>;
  const metrics = Object.values(scopes).flatMap((scope) =>
    Object.values(scope),
  );

  return {
    scenario: current.scenario,
    status: metrics.some(({ is_regression }) => is_regression)
      ? "large_regression"
      : metrics.some(({ absolute_delta }) => absolute_delta !== 0)
        ? "small_change"
        : "no_meaningful_change",
    scopes,
  };
}

export function compareContextMeasurements(
  baselineValue: unknown,
  currentValue: unknown,
  policy: ContextRegressionPolicy =
    DEFAULT_CONTEXT_REGRESSION_POLICY,
): ContextComparisonResult {
  validatePolicy(policy);

  const baseline = parseContextBaseline(baselineValue);
  const current = parseCurrentMeasurements(currentValue);
  const currentByScenario = new Map(
    current.map((measurement) => [
      measurement.scenario,
      measurement,
    ]),
  );
  const baselineScenarioNames = new Set(
    baseline.scenarios.map(({ scenario }) => scenario),
  );
  const scenarios: ContextScenarioComparison[] =
    baseline.scenarios.map((baselineMeasurement) => {
      const currentMeasurement = currentByScenario.get(
        baselineMeasurement.scenario,
      );

      return currentMeasurement
        ? compareScenario(
            baselineMeasurement,
            currentMeasurement,
            policy,
          )
        : {
            scenario: baselineMeasurement.scenario,
            status: "missing_scenario",
          };
    });

  for (const measurement of current) {
    if (!baselineScenarioNames.has(measurement.scenario)) {
      scenarios.push({
        scenario: measurement.scenario,
        status: "new_scenario",
      });
    }
  }

  return {
    policy,
    scenarios,
    has_regressions: scenarios.some(
      ({ status }) => status === "large_regression",
    ),
    requires_baseline_update: scenarios.some(
      ({ status }) =>
        status === "new_scenario" ||
        status === "missing_scenario",
    ),
  };
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatPercentage(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  const formatted = value.toFixed(1);

  return value > 0 ? `+${formatted}%` : `${formatted}%`;
}

function formatTokenDelta(
  comparison: ContextMetricComparison,
): string {
  return `${formatDelta(comparison.absolute_delta)} (${formatPercentage(comparison.percentage_delta)})`;
}

function formatSummaryTable(
  comparison: ContextComparisonResult,
): string[] {
  const headers = [
    "Scenario",
    "Tokens",
    "Baseline",
    "Delta",
    "Status",
  ];
  const rows = comparison.scenarios.map((scenario) => {
    const tokens = scenario.scopes?.total.estimated_tokens;

    return [
      scenario.scenario,
      tokens ? String(tokens.current) : "-",
      tokens ? String(tokens.baseline) : "-",
      tokens ? formatTokenDelta(tokens) : "-",
      scenario.status,
    ];
  });
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[index]?.length ?? 0),
    ),
  );
  const formatRow = (row: string[]): string =>
    row
      .map((value, index) =>
        index === 0 || index === 4
          ? value.padEnd(widths[index] ?? value.length)
          : value.padStart(widths[index] ?? value.length),
      )
      .join("  ");

  return [
    formatRow(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(formatRow),
  ];
}

function formatMetric(
  scope: ContextScope,
  metric: ContextMetric,
  comparison: ContextMetricComparison,
): string {
  return [
    `  ${scope}.${metric}`,
    `baseline=${comparison.baseline}`,
    `current=${comparison.current}`,
    `delta=${formatDelta(comparison.absolute_delta)}`,
    `percentage=${formatPercentage(comparison.percentage_delta)}`,
    `threshold=${comparison.threshold.absolute}/+${comparison.threshold.percentage.toFixed(1)}%`,
  ].join(" ");
}

export function formatContextComparison(
  comparison: ContextComparisonResult,
): string {
  const lines = [
    "Context Budget Report",
    "",
    ...formatSummaryTable(comparison),
    "",
    `Regression policy: bytes=${comparison.policy.minimum_absolute_increase.bytes}, characters=${comparison.policy.minimum_absolute_increase.characters}, estimated_tokens=${comparison.policy.minimum_absolute_increase.estimated_tokens}, percentage=+${comparison.policy.minimum_percentage_increase.toFixed(1)}%`,
  ];

  const regressions = comparison.scenarios.filter(
    ({ status }) => status === "large_regression",
  );

  if (regressions.length > 0) {
    lines.push("", "Context regression detected:");

    for (const scenario of regressions) {
      lines.push(scenario.scenario);

      if (!scenario.scopes) {
        continue;
      }

      for (const scope of CONTEXT_SCOPES) {
        for (const metric of CONTEXT_METRICS) {
          const metricComparison = scenario.scopes[scope][metric];

          if (metricComparison.is_regression) {
            lines.push(
              formatMetric(scope, metric, metricComparison),
            );
          }
        }
      }
    }
  }

  if (comparison.requires_baseline_update) {
    lines.push(
      "",
      "Baseline update required for new or missing scenarios.",
    );
  }

  const passed =
    !comparison.has_regressions &&
    !comparison.requires_baseline_update;

  lines.push("", `Result: ${passed ? "PASS" : "FAIL"}`);

  return lines.join("\n");
}

export function assertContextReportContainsNoSecrets(
  report: string,
  secrets: string[],
): void {
  if (secrets.some((secret) => secret && report.includes(secret))) {
    throw new ContextComparisonSecurityError(
      "Context comparison report contained a configured secret",
    );
  }
}
