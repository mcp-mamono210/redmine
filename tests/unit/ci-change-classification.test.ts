import { describe, expect, it } from "vitest";

import {
  FULL_QUALITY_GATE_DOMAINS,
  classifyChangedPaths,
} from "../../src/ci/change-classification.js";

describe("CI change classification", () => {
  it("allows heavy runtime verification to be skipped for allowlisted ordinary documentation", () => {
    const result = classifyChangedPaths(["README.md", "CHANGELOG.md"]);

    expect(result.classes).toEqual(["ordinary_documentation"]);
    expect(result.requiredVerificationDomains).toEqual([]);
    expect(result.heavyRuntimeVerificationSkippable).toBe(true);
    expect(result.failSafeApplied).toBe(false);
  });

  it("does not treat canonical contracts or ADRs as ordinary documentation", () => {
    const result = classifyChangedPaths([
      "docs/contracts/agent-brief-contract.md",
      "docs/adr/ADR-013-bounded-agent-brief-generation-input.md",
    ]);

    expect(result.classes).toEqual(["contract_architecture_ci"]);
    expect(result.requiredVerificationDomains).toEqual(["static", "unit"]);
    expect(result.pathClassifications.every((item) => item.rule === "canonical-contract-or-adr")).toBe(true);
  });

  it("keeps Context Budget verification for its contract and measurement files", () => {
    const result = classifyChangedPaths([
      "docs/context-budget.md",
      "tests/e2e/context-measurement.test.ts",
    ]);

    expect(result.classes).toEqual([
      "contract_architecture_ci",
      "runtime_test_environment",
      "context_budget",
    ]);
    expect(result.requiredVerificationDomains).toEqual([
      "static",
      "unit",
      "e2e",
      "context_budget",
    ]);
    expect(result.heavyRuntimeVerificationSkippable).toBe(false);
  });

  it("selects the full normal gate for MCP or Redmine runtime changes", () => {
    const result = classifyChangedPaths(["src/mcp/tools/issues.ts"]);

    expect(result.classes).toEqual([
      "runtime_test_environment",
      "context_budget",
    ]);
    expect(result.requiredVerificationDomains).toEqual(FULL_QUALITY_GATE_DOMAINS);
  });

  it("keeps a unit-only implementation change lightweight", () => {
    const result = classifyChangedPaths(["tests/unit/server.test.ts"]);

    expect(result.requiredVerificationDomains).toEqual(["static", "unit"]);
    expect(result.heavyRuntimeVerificationSkippable).toBe(true);
  });

  it("unions verification domains for mixed changes", () => {
    const result = classifyChangedPaths([
      "README.md",
      "tests/integration/redmine-client.test.ts",
      "tests/e2e/issues.test.ts",
    ]);

    expect(result.classes).toEqual([
      "ordinary_documentation",
      "runtime_test_environment",
    ]);
    expect(result.requiredVerificationDomains).toEqual([
      "static",
      "integration",
      "e2e",
    ]);
    expect(result.heavyRuntimeVerificationSkippable).toBe(false);
  });

  it("fails safe to the full gate for unknown paths", () => {
    const result = classifyChangedPaths(["new-area/unknown.file"]);

    expect(result.classes).toEqual(["ambiguous"]);
    expect(result.requiredVerificationDomains).toEqual(FULL_QUALITY_GATE_DOMAINS);
    expect(result.failSafeApplied).toBe(true);
  });

  it("fails safe for invalid or traversal-like paths", () => {
    const result = classifyChangedPaths(["../outside.md"]);

    expect(result.requiredVerificationDomains).toEqual(FULL_QUALITY_GATE_DOMAINS);
    expect(result.pathClassifications[0]?.rule).toBe("invalid-path-fail-safe");
    expect(result.failSafeApplied).toBe(true);
  });

  it("fails safe when the changed path set is empty", () => {
    const result = classifyChangedPaths([]);

    expect(result.requiredVerificationDomains).toEqual(FULL_QUALITY_GATE_DOMAINS);
    expect(result.failSafeApplied).toBe(true);
  });

  it.each(["release_candidate", "release"] as const)(
    "requires the full quality gate for %s regardless of changed paths",
    (executionContext: "release_candidate" | "release") => {
      const result = classifyChangedPaths(["README.md"], executionContext);

      expect(result.fullQualityGateRequired).toBe(true);
      expect(result.requiredVerificationDomains).toEqual(FULL_QUALITY_GATE_DOMAINS);
      expect(result.heavyRuntimeVerificationSkippable).toBe(false);
    },
  );

  it("normalizes relative and Windows-style repository paths deterministically", () => {
    const result = classifyChangedPaths([
      ".\\docs\\contracts\\agent-brief-contract.md",
    ]);

    expect(result.pathClassifications[0]?.normalizedPath).toBe(
      "docs/contracts/agent-brief-contract.md",
    );
    expect(result.classes).toEqual(["contract_architecture_ci"]);
  });
});
