import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(
  ROOT,
  "scripts/phase51/generate-release-compatibility-manifest.mjs",
);

function runSelfTest(): string {
  return execFileSync(
    process.execPath,
    [SCRIPT, "--root", ROOT, "--self-test"],
    { encoding: "utf8" },
  );
}

describe("Phase 51-5 release compatibility manifest support", () => {
  it("keeps the manifest generator syntactically valid", () => {
    expect(() =>
      execFileSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("proves generation identity, re-entry lineage, and duplicate-SoT guards", () => {
    const output = runSelfTest();
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"generationId": "PASS"');
    expect(output).toContain('"reentryHistory": "PASS"');
    expect(output).toContain('"duplicateVerificationSoTGuard": "PASS"');
    expect(output).toContain('"blockingDefectLineageGuard": "PASS"');
  });

  it("binds the manifest to the canonical Phase 51 evidence set", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("phase51-redmine-mcp-rc-identity.json");
    expect(source).toContain("phase51-redmine-mcp-rc-verification.json");
    expect(source).toContain("phase51-agent-runner-rc-identity.json");
    expect(source).toContain("phase51-agent-runner-rc-verification.json");
    expect(source).toContain("phase51-agent-runner-real-infrastructure-decision.json");
    expect(source).toContain("phase51-cross-component-compatibility.json");
    expect(source).toContain("v0.4.0-release-compatibility-manifest.json");
  });

  it("keeps component identity and verification references separated", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("rcIdentityEvidence");
    expect(source).toContain("redmineMcpRcVerification");
    expect(source).toContain("agentRunnerRcVerification");
    expect(source).toContain("agentRunnerRealInfrastructureDecision");
    expect(source).toContain("crossComponentCompatibility");
    expect(source).toContain("duplicates verification SoT");
  });

  it("fails closed on stale combinations and verifies immutable contract blobs", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("assertEvidenceCombination");
    expect(source).toContain("assertContractBlobs");
    expect(source).toContain("gitBlobShaAt");
    expect(source).toContain("compatibility / registry contract identities");
    expect(source).toContain("expected handoff profile references stale contract revision");
  });

  it("preserves Phase 52 mandatory system-release gates from Phase 50 evidence", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("real-private-s3-system-release-gate");
    expect(source).toContain("sandbox-environment-conformance-system-release-gate");
    expect(source).toContain("realInfrastructurePolicy.realS3.releaseGateCommand");
    expect(source).toContain("realInfrastructurePolicy.sandbox.releaseGateCommand");
  });
});
