import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/phase51/verify-phase51-final-gate.mjs");

function runSelfTest(): string {
  return execFileSync(process.execPath, [SCRIPT, "--self-test"], { encoding: "utf8" });
}

describe("Phase 51-6 Final Gate / Phase 52 handoff support", () => {
  it("keeps the Final Gate verifier syntactically valid", () => {
    expect(() => execFileSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" })).not.toThrow();
  });

  it("proves evidence lineage, Redmine classification, and documentation drift guards", () => {
    const output = runSelfTest();
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"generationId": "PASS"');
    expect(output).toContain('"reentryHistory": "PASS"');
    expect(output).toContain('"redmineClassification": "PASS"');
    expect(output).toContain('"documentationDriftNegativeControl": "PASS"');
  });

  it("binds the Final Gate to all canonical Phase 51 evidence and strict validation", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("phase51-redmine-mcp-rc-identity.json");
    expect(source).toContain("phase51-agent-runner-rc-identity.json");
    expect(source).toContain("phase51-cross-component-compatibility.json");
    expect(source).toContain("v0.4.0-release-compatibility-manifest.json");
    expect(source).toContain('"--mode", "strict"');
    expect(source).toContain('"--negative-controls"');
    expect(source).toContain('"--validate-only"');
  });

  it("verifies live Redmine SoT, documentation alignment, and Phase 52 mandatory gates", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("PHASE51_REDMINE_URL");
    expect(source).toContain("PHASE51_REDMINE_API_KEY");
    expect(source).toContain("100_ロードマップ");
    expect(source).toContain("Ready for Independent Verification");
    expect(source).toContain("npm run verify:phase49:s3");
    expect(source).toContain("npm run verify:phase50:environment");
  });

  it("generates only the canonical Final Gate evidence and Phase 52 handoff outputs", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("docs/verification/phase51-final-verification.json");
    expect(source).toContain("docs/verification/phase51-phase52-handoff.md");
    expect(source).toContain("phase52MandatoryGates");
    expect(source).toContain("outOfScopeBoundary");
  });
});
