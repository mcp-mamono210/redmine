import { describe, expect, it } from "vitest";

import {
  ContextBaselineError,
  ContextComparisonSecurityError,
  ContextMeasurementError,
  DEFAULT_CONTEXT_REGRESSION_POLICY,
  assertContextReportContainsNoSecrets,
  compareContextMeasurements,
  formatContextComparison,
} from "../helpers/context-comparison.js";
import {
  createContextBaseline,
  type ContextMeasurement,
  type ContextSize,
} from "../helpers/context-measurement.js";

function size(
  bytes: number,
  characters = bytes,
  estimatedTokens = Math.ceil(bytes / 4),
): ContextSize {
  return {
    bytes,
    characters,
    estimated_tokens: estimatedTokens,
  };
}

function measurement(
  scenario: string,
  total = size(1_000),
  contentText = size(400),
  structuredContent = size(400),
): ContextMeasurement {
  return {
    scenario,
    items: 1,
    total,
    content_text: contentText,
    structured_content: structuredContent,
  };
}

describe("Context comparison", () => {
  it("reports deterministic measurements as unchanged", () => {
    const baselineMeasurement = measurement("tools/list");
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [baselineMeasurement],
    );

    expect(result).toMatchObject({
      has_regressions: false,
      requires_baseline_update: false,
      scenarios: [
        {
          scenario: "tools/list",
          status: "no_meaningful_change",
        },
      ],
    });
    expect(
      result.scenarios[0]?.scopes?.total.bytes,
    ).toMatchObject({
      baseline: 1_000,
      current: 1_000,
      absolute_delta: 0,
      percentage_delta: 0,
      is_regression: false,
    });
  });

  it("reports changes below the absolute threshold without failing", () => {
    const baselineMeasurement = measurement("small-change");
    const currentMeasurement = measurement(
      "small-change",
      size(1_100, 1_100, 260),
    );
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(false);
    expect(result.scenarios[0]?.status).toBe("small_change");
  });

  it("reports changes below the percentage threshold without failing", () => {
    const baselineMeasurement = measurement(
      "low-percentage",
      size(10_000, 10_000, 2_500),
    );
    const currentMeasurement = measurement(
      "low-percentage",
      size(10_300, 10_300, 2_575),
    );
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(false);
    expect(result.scenarios[0]?.status).toBe("small_change");
  });

  it("does not regress one unit below the absolute threshold", () => {
    const baselineMeasurement = measurement(
      "absolute-threshold-minus-one",
      size(5_000, 5_000, 1_250),
    );
    const currentMeasurement = measurement(
      "absolute-threshold-minus-one",
      size(5_255, 5_255, 1_313),
    );

    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(false);
    expect(result.scenarios[0]?.status).toBe("small_change");
    expect(
      result.scenarios[0]?.scopes?.total.bytes.is_regression,
    ).toBe(false);
  });

  it("regresses exactly at both absolute and percentage thresholds", () => {
    const baselineMeasurement = measurement(
      "exact-threshold",
      size(5_120, 5_120, 1_280),
    );
    const currentMeasurement = measurement(
      "exact-threshold",
      size(5_376, 5_376, 1_344),
    );

    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );
    const total = result.scenarios[0]?.scopes?.total;

    expect(result.has_regressions).toBe(true);
    expect(result.scenarios[0]?.status).toBe("large_regression");
    expect(total?.bytes).toMatchObject({
      absolute_delta: 256,
      percentage_delta: 5,
      is_regression: true,
    });
    expect(total?.characters.is_regression).toBe(true);
    expect(total?.estimated_tokens).toMatchObject({
      absolute_delta: 64,
      percentage_delta: 5,
      is_regression: true,
    });
  });

  it("regresses one unit above the absolute threshold when percentage also exceeds the threshold", () => {
    const baselineMeasurement = measurement(
      "threshold-plus-one",
      size(5_000, 5_000, 1_250),
    );
    const currentMeasurement = measurement(
      "threshold-plus-one",
      size(5_257, 5_257, 1_315),
    );

    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(true);
    expect(result.scenarios[0]?.status).toBe("large_regression");
    expect(
      result.scenarios[0]?.scopes?.total.bytes.is_regression,
    ).toBe(true);
    expect(
      result.scenarios[0]?.scopes?.total.estimated_tokens.is_regression,
    ).toBe(true);
  });

  it("requires both absolute and percentage thresholds to be reached", () => {
    const baselineMeasurement = measurement(
      "and-policy",
      size(10_000, 10_000, 2_500),
    );
    const currentMeasurement = measurement(
      "and-policy",
      size(10_256, 10_256, 2_564),
    );

    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );
    const total = result.scenarios[0]?.scopes?.total;

    expect(total?.bytes.absolute_delta).toBe(256);
    expect(total?.bytes.percentage_delta).toBeCloseTo(2.56);
    expect(total?.bytes.is_regression).toBe(false);
    expect(total?.estimated_tokens.absolute_delta).toBe(64);
    expect(total?.estimated_tokens.percentage_delta).toBeCloseTo(2.56);
    expect(total?.estimated_tokens.is_regression).toBe(false);
    expect(result.has_regressions).toBe(false);
    expect(result.scenarios[0]?.status).toBe("small_change");
  });

  it("detects a large regression using explicit absolute and percentage thresholds", () => {
    const baselineMeasurement = measurement("regression");
    const currentMeasurement = measurement(
      "regression",
      size(1_300, 1_300, 320),
    );
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );
    const total = result.scenarios[0]?.scopes?.total;

    expect(result.has_regressions).toBe(true);
    expect(result.scenarios[0]?.status).toBe("large_regression");
    expect(total?.bytes).toMatchObject({
      absolute_delta: 300,
      percentage_delta: 30,
      threshold: {
        absolute:
          DEFAULT_CONTEXT_REGRESSION_POLICY
            .minimum_absolute_increase.bytes,
        percentage:
          DEFAULT_CONTEXT_REGRESSION_POLICY
            .minimum_percentage_increase,
      },
      is_regression: true,
    });
    expect(total?.estimated_tokens.is_regression).toBe(true);
  });

  it("detects a regression in a non-total scope", () => {
    const baselineMeasurement = measurement(
      "structured-regression",
      size(10_000, 10_000, 2_500),
      size(100),
      size(1_000, 1_000, 250),
    );
    const currentMeasurement = measurement(
      "structured-regression",
      size(10_000, 10_000, 2_500),
      size(100),
      size(1_300, 1_300, 325),
    );

    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(true);
    expect(result.scenarios[0]?.status).toBe("large_regression");
    expect(
      result.scenarios[0]?.scopes?.total.bytes.is_regression,
    ).toBe(false);
    expect(
      result.scenarios[0]?.scopes?.structured_content.bytes.is_regression,
    ).toBe(true);
  });

  it("treats context reductions as a small non-regressing change", () => {
    const baselineMeasurement = measurement("optimization");
    const currentMeasurement = measurement(
      "optimization",
      size(500, 500, 125),
    );
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );

    expect(result.has_regressions).toBe(false);
    expect(result.scenarios[0]?.status).toBe("small_change");
    expect(
      result.scenarios[0]?.scopes?.total.bytes.absolute_delta,
    ).toBe(-500);
  });

  it("handles growth from a zero baseline without an infinite percentage", () => {
    const baselineMeasurement = measurement(
      "new-payload",
      size(0),
    );
    const currentMeasurement = measurement(
      "new-payload",
      size(300, 300, 75),
    );
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [currentMeasurement],
    );
    const bytes = result.scenarios[0]?.scopes?.total.bytes;

    expect(bytes?.percentage_delta).toBeNull();
    expect(bytes?.is_regression).toBe(true);
    expect(result.has_regressions).toBe(true);
  });

  it("distinguishes new and missing scenarios from regressions", () => {
    const result = compareContextMeasurements(
      createContextBaseline([measurement("removed")]),
      [measurement("added")],
    );

    expect(result.has_regressions).toBe(false);
    expect(result.requires_baseline_update).toBe(true);
    expect(result.scenarios).toEqual([
      {
        scenario: "removed",
        status: "missing_scenario",
      },
      {
        scenario: "added",
        status: "new_scenario",
      },
    ]);
  });

  it("distinguishes baseline schema mismatch from invalid current measurements", () => {
    expect(() =>
      compareContextMeasurements(
        {
          ...createContextBaseline([]),
          format_version: 2,
        },
        [],
      ),
    ).toThrow(ContextBaselineError);

    const duplicate = measurement("duplicate");

    expect(() =>
      compareContextMeasurements(
        createContextBaseline([]),
        [duplicate, duplicate],
      ),
    ).toThrow(ContextMeasurementError);
  });

  it("rejects invalid regression policy thresholds", () => {
    expect(() =>
      compareContextMeasurements(
        createContextBaseline([]),
        [],
        {
          minimum_absolute_increase: {
            bytes: -1,
            characters: 256,
            estimated_tokens: 64,
          },
          minimum_percentage_increase: 5,
        },
      ),
    ).toThrow(ContextMeasurementError);
  });

  it("formats actionable numeric diagnostics without raw responses", () => {
    const result = compareContextMeasurements(
      createContextBaseline([measurement("regression")]),
      [
        measurement(
          "regression",
          size(1_300, 1_300, 320),
        ),
      ],
    );
    const report = formatContextComparison(result);

    expect(report).toContain("Context Budget Report");
    expect(report).toContain("Scenario");
    expect(report).toContain("regression");
    expect(report).toContain("large_regression");
    expect(report).toContain("Context regression detected:");
    expect(report).toContain(
      "total.bytes baseline=1000 current=1300",
    );
    expect(report).toContain("delta=+300");
    expect(report).toContain("percentage=+30.0%");
    expect(report).toContain("threshold=256/+5.0%");
    expect(report).toContain("Result: FAIL");
    expect(report).not.toContain("structuredContent");
  });

  it("formats an unchanged comparison as a passing summary", () => {
    const baselineMeasurement = measurement("tools/list");
    const result = compareContextMeasurements(
      createContextBaseline([baselineMeasurement]),
      [baselineMeasurement],
    );
    const report = formatContextComparison(result);

    expect(report).toContain("tools/list");
    expect(report).toContain("no_meaningful_change");
    expect(report).toContain("0 (0.0%)");
    expect(report).toContain("Result: PASS");
    expect(report).not.toContain(
      "Context regression detected:",
    );
  });

  it("reports scenario changes as requiring a baseline update", () => {
    const result = compareContextMeasurements(
      createContextBaseline([measurement("removed")]),
      [measurement("added")],
    );
    const report = formatContextComparison(result);

    expect(report).toContain("removed");
    expect(report).toContain("missing_scenario");
    expect(report).toContain("added");
    expect(report).toContain("new_scenario");
    expect(report).toContain(
      "Baseline update required for new or missing scenarios.",
    );
    expect(report).toContain("Result: FAIL");
  });

  it("blocks diagnostic output containing a configured secret", () => {
    expect(() =>
      assertContextReportContainsNoSecrets(
        "diagnostic secret-value",
        ["secret-value"],
      ),
    ).toThrow(ContextComparisonSecurityError);

    expect(() =>
      assertContextReportContainsNoSecrets(
        "safe diagnostic",
        ["secret-value"],
      ),
    ).not.toThrow();
  });
});
