import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const VALIDATOR = resolve(
  ROOT,
  "scripts/phase51/validate-system-release-compatibility.mjs",
);

function runValidator(...args: string[]): string {
  return execFileSync(
    process.execPath,
    [VALIDATOR, "--root", ROOT, ...args],
    { encoding: "utf8" },
  );
}

describe("Phase 51-1 system release compatibility contract", () => {
  it("validates the canonical registry, handoff profile, evidence envelope, and contract blob", () => {
    expect(runValidator("--mode", "staging")).toContain(
      "Phase 51-1 compatibility contract validation PASS",
    );
  });

  it("proves every registered negative control fails closed", () => {
    const output = runValidator("--mode", "staging", "--negative-controls");
    expect(output).toMatch(/negativeControls=[1-9][0-9]*/u);
  });

  it("documents semantic revision 2 registry finalization and strict main gating", () => {
    const contract = readFileSync(
      resolve(ROOT, "docs/contracts/system-release-compatibility-contract.md"),
      "utf8",
    );

    const normalizedContract = contract.replace(/\s+/gu, " ");

    expect(normalizedContract).toContain("Semantic revision: `2`");
    expect(normalizedContract).toContain("operational-normative");
    expect(normalizedContract).toContain("compatibilityImpact = none");
    expect(normalizedContract).toContain("final PR state");
    expect(normalizedContract).toContain("main branch");
    expect(normalizedContract).toContain(
      "script/function names are not contract identity",
    );
  });

  it("keeps the canonical Phase 50 baseline as an Agent Runner input rather than rebuilding it locally", () => {
    const contract = readFileSync(
      resolve(ROOT, "docs/contracts/system-release-compatibility-contract.md"),
      "utf8",
    );

    const normalizedContract = contract.replace(/\s+/gu, " ");

    expect(normalizedContract).toContain("mcp-mamono210/ai-agent-runner");
    expect(normalizedContract).toContain(
      "docs/contracts/phase50-contract-baseline.json",
    );
    expect(normalizedContract).toContain("does not reconstruct that baseline");
  });

  it("keeps verification-only Phase 51 scripts outside the runtime artifact only under explicit conditions", () => {
    const contract = readFileSync(
      resolve(ROOT, "docs/contracts/system-release-compatibility-contract.md"),
      "utf8",
    );

    expect(contract).toContain("scripts/phase51/**");
    expect(contract).toContain("verification-only");
    expect(contract).toContain("production dependency graph");
  });
});