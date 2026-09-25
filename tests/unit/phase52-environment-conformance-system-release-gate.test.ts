import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const ENVIRONMENT_RUNNER = resolve(
  ROOT,
  "scripts/phase52/run-environment-conformance-system-release-gate.mjs",
);
const ENVIRONMENT_FINALIZER = resolve(
  ROOT,
  "scripts/phase52/finalize-environment-conformance-system-release-gate.mjs",
);

function runNode(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("Phase 52-2 sandbox/environment conformance system-release Gate", () => {
  it("keeps the environment runner and canonical finalizer syntactically valid", () => {
    for (const script of [ENVIRONMENT_RUNNER, ENVIRONMENT_FINALIZER]) {
      expect(() =>
        execFileSync(process.execPath, ["--check", script], {
          cwd: ROOT,
          encoding: "utf8",
        }),
      ).not.toThrow();
    }
  });

  it("keeps the environment Gate fail-closed and isolates Phase 50 canonical evidence", () => {
    const output = runNode(ENVIRONMENT_RUNNER, "--self-test");
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"exactCheckoutGuard": "PASS"');
    expect(output).toContain('"dockerEvidenceRequired": "PASS"');
    expect(output).toContain('"testedRevisionDetectedByVerifier": "PASS"');
    expect(output).toContain('"testedRevisionEnvGuard": "PASS"');
    expect(output).toContain('"endpointGuard": "PASS"');
    expect(output).toContain('"outputPathGuard": "PASS"');
    expect(output).toContain('"phase50EvidenceOverwriteGuard": "PASS"');
    expect(output).toContain('"requiredRecordPathGuard": "PASS"');
    expect(output).toContain('"resolvedAlternateCoverage": "PASS"');
    expect(output).toContain('"unresolvedCoverageFailClosed": "PASS"');
    expect(output).toContain('"failRawEvidenceGeneration": "PASS"');
    expect(output).toContain('"awsIdentityPrivacy": "PASS"');
    expect(output).toContain('"hostObservationNotDeploymentCertification": "PASS"');
  });

  it("finalizes immutable Agent Runner environment evidence into the Phase 52 envelope", () => {
    const output = runNode(ENVIRONMENT_FINALIZER, "--self-test");
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"failGenerationPreserved": "PASS"');
    expect(output).toContain('"passSupersedesFail": "PASS"');
    expect(output).toContain('"testedVsEvidenceRevisionSeparated": "PASS"');
    expect(output).toContain('"rawRecordSha256": "PASS"');
    expect(output).toContain('"evidenceBlobSha": "PASS"');
    expect(output).toContain('"evidenceRevisionMainReachability": "PASS"');
    expect(output).toContain('"unresolvedCoverageClosure": "PASS"');
    expect(output).toContain('"awsIdentityPrivacy": "PASS"');
    expect(output).toContain('"hostObservationNotDeploymentCertification": "PASS"');
    expect(output).toContain('"schemaValidation": "PASS"');
  });

  it("keeps AWS S3-only, mandatory coverage closure, privacy, and deployment deferral explicit in source", () => {
    const runner = readFileSync(ENVIRONMENT_RUNNER, "utf8");
    const finalizer = readFileSync(ENVIRONMENT_FINALIZER, "utf8");

    expect(runner).toContain("PHASE50_ENVIRONMENT_CONFORMANCE_RECORD");
    expect(runner).toContain("PHASE50_TESTED_GIT_REVISION");
    expect(runner).toContain("PHASE50_S3_CONFORMANCE_ENDPOINT");
    expect(runner).toContain("verify:phase50:environment");
    expect(runner).toContain("unresolvedMandatoryCoverageGapCount");
    expect(runner).toContain("missingMandatoryAlternateCoverageCount");
    expect(runner).toContain("productionDeploymentCertification: false");
    expect(runner).toContain("containsRawAwsIdentity");

    expect(finalizer).toContain("assertEvidenceRevisionReachableFromMain");
    expect(finalizer).toContain("gitBlobShaAtRevision");
    expect(finalizer).toContain("rawRecordSha256");
    expect(finalizer).toContain("evidenceBlobSha");
    expect(finalizer).toContain("unresolvedMandatoryCoverageGapCount");
    expect(finalizer).toContain("productionDeploymentCertification: false");
    expect(finalizer).toContain("makeReentryEvidenceRecord");
    expect(finalizer).toContain("validateEvidenceAgainstSchema");
  });
});
