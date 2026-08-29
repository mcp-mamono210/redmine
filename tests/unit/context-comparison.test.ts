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

    expect(report).toContain("regression [large_regression]");
    expect(report).toContain("total.bytes baseline=1000 current=1300");
    expect(report).toContain("delta=+300");
    expect(report).toContain("percentage=+30.0%");
    expect(report).toContain("threshold=256/+5.0%");
    expect(report).not.toContain("structuredContent");
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
