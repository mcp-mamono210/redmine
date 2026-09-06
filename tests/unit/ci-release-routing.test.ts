import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { planCiPipeline } from "../../src/ci/pipeline-routing.js";

const setupConfig = readFileSync(
  resolve(process.cwd(), ".circleci/config.yml"),
  "utf8",
);
const continuationConfig = readFileSync(
  resolve(process.cwd(), ".circleci/continue_config.yml"),
  "utf8",
);
const routeScript = readFileSync(
  resolve(process.cwd(), "scripts/ci/route-pipeline.mjs"),
  "utf8",
);

describe("CI normal/release routing", () => {
  it("routes ordinary documentation to a lightweight normal marker", () => {
    const plan = planCiPipeline(["README.md"]);
    expect(plan.runDocsOnly).toBe(true);
    expect(plan.runStatic).toBe(false);
    expect(plan.runIntegration).toBe(false);
    expect(plan.runFullReleaseGate).toBe(false);
  });

  it("preserves CI-1 domain selection for normal contract changes", () => {
    const plan = planCiPipeline(["docs/contracts/example.md"]);
    expect(plan.runStatic).toBe(true);
    expect(plan.runUnit).toBe(true);
    expect(plan.runIntegration).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.runContextBudget).toBe(false);
  });

  it("fails safe for ambiguous normal changes", () => {
    const plan = planCiPipeline(["unknown/new-area.txt"]);
    expect(plan.classification.failSafeApplied).toBe(true);
    expect(plan.runStatic).toBe(true);
    expect(plan.runUnit).toBe(true);
    expect(plan.runIntegration).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runContextBudget).toBe(true);
  });

  it("forces release candidates through the full release gate", () => {
    const plan = planCiPipeline(["README.md"], {
      requestedExecutionContext: "release_candidate",
    });
    expect(plan.resolvedExecutionContext).toBe("release_candidate");
    expect(plan.runFullReleaseGate).toBe(true);
    expect(plan.runDocsOnly).toBe(false);
  });

  it("treats any tag pipeline as release-oriented", () => {
    const plan = planCiPipeline(["README.md"], {
      requestedExecutionContext: "normal",
      tag: "v0.3.0",
    });
    expect(plan.resolvedExecutionContext).toBe("release");
    expect(plan.runFullReleaseGate).toBe(true);
  });

  it("preserves explicit manual reproducibility for normal pipelines", () => {
    const plan = planCiPipeline(["README.md"], {
      runReproducibility: true,
    });
    expect(plan.runDocsOnly).toBe(true);
    expect(plan.runManualReproducibility).toBe(true);
    expect(plan.runFullReleaseGate).toBe(false);
  });

  it("uses CircleCI dynamic continuation and the committed routing implementation", () => {
    expect(setupConfig).toContain("setup: true");
    expect(setupConfig).toContain("continuation: circleci/continuation@1.1.0");
    expect(setupConfig).toContain(".circleci/continue_config.yml");
    expect(routeScript).toContain("planCiPipeline");
    expect(routeScript).toContain("dist/src/ci/pipeline-routing.js");
  });

  it("declares trigger parameters in both dynamic-config phases without routing from them twice", () => {
    for (const config of [setupConfig, continuationConfig]) {
      expect(config).toContain("ci_execution_context:");
      expect(config).toContain("run_reproducibility:");
    }

    expect(continuationConfig).toContain("ci_execution_context:\n    type: string\n    default: normal");
    expect(continuationConfig).toContain("run_reproducibility:\n    type: boolean\n    default: false");

    // The continuation call receives only the resolved run_* JSON file.
    // Raw trigger parameters must not be added to that JSON.
    expect(routeScript).not.toContain('"ci_execution_context"');
    expect(routeScript).not.toContain('"run_reproducibility"');
  });

  it("requires every full-gate job before release_gate can succeed", () => {
    expect(continuationConfig).toContain("release_full_quality_gate:");
    for (const job of [
      "static",
      "unit",
      "integration",
      "e2e",
      "context_budget",
      "reproducibility",
    ]) {
      expect(continuationConfig).toContain(`            - ${job}`);
    }
    expect(continuationConfig).not.toContain("context:baseline:update");
  });
});
