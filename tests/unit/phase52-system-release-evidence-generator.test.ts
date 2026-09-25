import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const GENERATOR = resolve(
  ROOT,
  "scripts/phase52/generate-system-release-evidence.mjs",
);

function runNode(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("Phase 52-3 system release evidence preparation", () => {
  it("keeps the generator syntactically valid and its deterministic self-test PASS", () => {
    expect(() =>
      execFileSync(process.execPath, ["--check", GENERATOR], {
        cwd: ROOT,
        encoding: "utf8",
      }),
    ).not.toThrow();

    const output = runNode(GENERATOR, "--self-test");
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"handoffParsing": "PASS"');
    expect(output).toContain('"policyReferenceInterpretation": "PASS"');
    expect(output).toContain('"canonicalGitProcessClassification": "PASS"');
    expect(output).toContain('"noncanonicalProcessDetection": "PASS"');
    expect(output).toContain('"singleResultField": "PASS"');
    expect(output).toContain('"dryRunOnlyBoundary": "PASS"');
  });

  it("keeps Phase 52-3 dry-run only and preserves Phase 51 read-only validation", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain("Phase 52-3 generator requires --dry-run");
    expect(source).toContain("final publication belongs to Phase 52-4");
    expect(source).toContain("validate-system-release-compatibility.mjs");
    expect(source).toContain('"--mode"');
    expect(source).toContain('"strict"');
    expect(source).toContain('"--negative-controls"');
    expect(source).toContain("verify-phase51-final-gate.mjs");
    expect(source).toContain('"--validate-only"');
    expect(source).toContain("phase51EvidenceMutationCount: 0");
    expect(source).toContain("canonicalRecordWritten: false");
  });

  it("closes Phase 52 Gate identity through Git blob, raw SHA-256, and main reachability", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain("gitBlobShaAtRevision");
    expect(source).toContain("rawRecordSha256 mismatch");
    expect(source).toContain("assertEvidenceRevisionReachableFromMain");
    expect(source).toContain("testedSourceRevision does not match Agent Runner exact RC");
    expect(source).toContain("phase52-real-s3-system-release-gate");
    expect(source).toContain("phase52-environment-conformance-system-release-gate");
  });

  it("keeps policy references distinct from actual Phase 52 Gate result evidence", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain('interpretation: "policyReference"');
    expect(source).toContain("actualGateResultSource");
    expect(source).toContain("phase50-real-infrastructure-policy.json");
    expect(source).toContain("phase51GatePolicyReferences");
  });

  it("fails closed on release-freeze or unresolved Redmine MCP process-launch changes", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain("assertNoReleaseFreezeViolations");
    expect(source).toContain("gitChangedPaths");
    expect(source).toContain("node:child_process");
    expect(source).toContain("execFile");
    expect(source).toContain("spawn");
    expect(source).toContain("fork");
    expect(source).toContain("unknown / unresolved process-launch site found");
    expect(source).toContain("Agent Brief persistence Git process");
    expect(source).toContain("agentProcessLaunchSiteCount: 0");
    expect(source).toContain("agentRunnerProcessLaunchSiteCount: 0");
  });

  it("records v0.4.0 deployment and credential boundaries without claiming production deployment", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain("design-and-implementation-separation-only");
    expect(source).toContain("DEFERRED_TO_DEPLOYMENT_OPERATIONS_RELEASE");
    expect(source).toContain("dedicatedGceDeploymentAcceptance");
    expect(source).toContain("deploymentEnvironmentConformanceRerun");
    expect(source).toContain("gceVerificationIsProductionDeploymentCertification: false");
    expect(source).toContain("createPhase49_5ProductionRuntime");
    expect(source).toContain("Phase49S3ArtifactPersistence");
    expect(source).toContain("REDMINE_WRITE_API_KEY");
    expect(source).toContain("CONTROL_PLANE_API_KEY");
    expect(source).toContain("packageStartScriptPresent");
    expect(source).toContain("packageBinPresent");
    expect(source).toContain("system-v0.4.0");
    expect(source).toContain("v0.3.0 unchanged");
  });

  it("uses one result field for the prospective system release record", () => {
    const source = readFileSync(GENERATOR, "utf8");

    expect(source).toContain('const SYSTEM_RECORD_TYPE = "v0.4.0-system-release"');
    expect(source).toContain("makeInitialEvidenceRecord");
    expect(source).toContain("validateEvidenceAgainstSchema");
    expect(source).toContain("system release record must not contain releaseResult");
  });
});
