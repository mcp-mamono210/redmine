import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const REAL_S3_RUNNER = resolve(
  ROOT,
  "scripts/phase52/run-real-s3-system-release-gate.mjs",
);
const REAL_S3_FINALIZER = resolve(
  ROOT,
  "scripts/phase52/finalize-real-s3-system-release-gate.mjs",
);

function runNode(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("Phase 52-1 real private S3 system-release Gate", () => {
  it("keeps runner and canonical evidence finalizer syntactically valid", () => {
    for (const script of [REAL_S3_RUNNER, REAL_S3_FINALIZER]) {
      expect(() =>
        execFileSync(process.execPath, ["--check", script], {
          cwd: ROOT,
          encoding: "utf8",
        }),
      ).not.toThrow();
    }
  });

  it("keeps the real-S3 runner fail-closed and preserves sanitized FAIL raw evidence", () => {
    const output = runNode(REAL_S3_RUNNER, "--self-test");
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"exactCheckoutGuard": "PASS"');
    expect(output).toContain('"optionalDockerEvidence": "PASS"');
    expect(output).toContain('"testedRevisionOwnership": "PASS"');
    expect(output).toContain('"iamAccessDeniedVerification": "PASS"');
    expect(output).toContain('"noSuchBucketNegativeControl": "PASS"');
    expect(output).toContain('"verifierIdentityValidation": "PASS"');
    expect(output).toContain('"failRawEvidenceGeneration": "PASS"');
    expect(output).toContain('"rawOutputOutsideCheckout": "PASS"');
  });

  it("isolates the self-test from host real-S3 environment variables", () => {
    const output = execFileSync(process.execPath, [REAL_S3_RUNNER, "--self-test"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        AGENT_RUNNER_ARTIFACT_S3_EXPECTED_BUCKET_OWNER: "123456789012",
        PHASE49_REAL_S3_TESTED_GIT_REVISION: "f".repeat(40),
        PHASE49_REAL_S3_VERIFICATION_RECORD: "/tmp/phase49-host-record.json",
      },
    });

    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"failRawEvidenceGeneration": "PASS"');
  });

  it("finalizes immutable Agent Runner evidence into canonical Phase 52 envelope", () => {
    const output = runNode(REAL_S3_FINALIZER, "--self-test");
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"failGenerationPreserved": "PASS"');
    expect(output).toContain('"passSupersedesFail": "PASS"');
    expect(output).toContain('"testedVsEvidenceRevisionSeparated": "PASS"');
    expect(output).toContain('"rawRecordSha256": "PASS"');
    expect(output).toContain('"evidenceBlobSha": "PASS"');
    expect(output).toContain('"evidenceRevisionMainReachability": "PASS"');
    expect(output).toContain('"phase49VerifierIdentity": "PASS"');
    expect(output).toContain('"awsIdentityPrivacy": "PASS"');
    expect(output).toContain('"schemaValidation": "PASS"');
  });

  it("rechecks verifier result/revision and keeps public AWS identity sanitized", () => {
    const runner = readFileSync(REAL_S3_RUNNER, "utf8");
    const finalizer = readFileSync(REAL_S3_FINALIZER, "utf8");

    expect(runner).toContain('record.result !== "PASS"');
    expect(runner).toContain("record.testedGitRevision !== testedSourceRevision");
    expect(runner).toContain("sanitizeFailureMessage");
    expect(runner).toContain('AGENT_RUNNER_ARTIFACT_S3_EXPECTED_BUCKET_OWNER: ""');
    expect(runner).toContain('PHASE49_REAL_S3_TESTED_GIT_REVISION: ""');
    expect(runner).toContain('args[1] === "delete-object"');
    expect(runner).toContain('result: "FAIL"');

    expect(finalizer).toContain("assertEvidenceRevisionReachableFromMain");
    expect(finalizer).toContain("gitBlobShaAtRevision");
    expect(finalizer).toContain("rawRecordSha256");
    expect(finalizer).toContain("evidenceBlobSha");
    expect(finalizer).toContain("normalizedPrincipalArnSha256");
    expect(finalizer).toContain("makeReentryEvidenceRecord");
    expect(finalizer).toContain("validateEvidenceAgainstSchema");
  });
});
