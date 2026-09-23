import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(
  ROOT,
  "scripts/phase51/verify-cross-component-compatibility.mjs",
);

function runSelfTest(): string {
  return execFileSync(
    process.execPath,
    [SCRIPT, "--root", ROOT, "--self-test"],
    { encoding: "utf8" },
  );
}

describe("Phase 51-4 cross-component compatibility support", () => {
  it("keeps the verification orchestrator syntactically valid", () => {
    expect(() =>
      execFileSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("proves canonical comparison catches producer and consumer drifting together", () => {
    const output = runSelfTest();
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"sameDirectionDriftDetected": true');
    expect(output).toContain('"contractDerivedFixture": "PASS"');
    expect(output).toContain('"generationId": "PASS"');
    expect(output).toContain('"sourceBlobConventions": "PASS"');
  });

  it("binds the orchestrator to exact RC checkouts and canonical Phase 51 evidence", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("assertExactCleanCheckout");
    expect(source).toContain("phase51-redmine-mcp-rc-identity.json");
    expect(source).toContain("phase51-agent-runner-rc-identity.json");
    expect(source).toContain("phase51-agent-runner-real-infrastructure-decision.json");
    expect(source).toContain("phase51-cross-component-compatibility.json");
  });

  it("uses all three compatibility layers and verifies actual source blobs", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("contractVsProducer");
    expect(source).toContain("contractVsConsumer");
    expect(source).toContain("producerRepresentation");
    expect(source).toContain("consumerValidation");
    expect(source).toContain("requirementsFingerprintCompatibilityResult");
    expect(source).toContain("phase50GoldenBaseline");
    expect(source).toContain("gitBlobSha");
  });
});
