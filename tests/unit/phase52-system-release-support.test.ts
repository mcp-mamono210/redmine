import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const COMMON = resolve(ROOT, "scripts/phase52/common.mjs");
const VALIDATOR = resolve(
  ROOT,
  "scripts/phase52/validate-system-release-evidence.mjs",
);
const REAL_S3_RUNNER = resolve(
  ROOT,
  "scripts/phase52/run-real-s3-system-release-gate.mjs",
);
const ENVIRONMENT_RUNNER = resolve(
  ROOT,
  "scripts/phase52/run-environment-conformance-system-release-gate.mjs",
);
const SYSTEM_RELEASE_GENERATOR = resolve(
  ROOT,
  "scripts/phase52/generate-system-release-evidence.mjs",
);
const SCHEMA = resolve(
  ROOT,
  "docs/verification/phase52-system-release-evidence.schema.json",
);

function runNode(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
}

function runSelfTest(script: string): string {
  return runNode(script, "--self-test");
}

describe("Phase 52-0 system release verification support", () => {
  it("keeps every Phase 52 verification script syntactically valid", () => {
    for (const script of [
      COMMON,
      VALIDATOR,
      REAL_S3_RUNNER,
      ENVIRONMENT_RUNNER,
      SYSTEM_RELEASE_GENERATOR,
    ]) {
      expect(() =>
        execFileSync(process.execPath, ["--check", script], { encoding: "utf8" }),
      ).not.toThrow();
    }
  });

  it("fixes the Phase 52 release-evidence-only envelope without modifying Phase 51 record types", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    const normalized = schema.replace(/\s+/gu, " ");

    expect(normalized).toContain("release-evidence-only");
    expect(normalized).toContain("non-cross-component-contract");
    expect(normalized).toContain("phase52-real-s3-system-release-gate");
    expect(normalized).toContain("phase52-environment-conformance-system-release-gate");
    expect(normalized).toContain("v0.4.0-system-release");
    expect(normalized).toContain('"current": { "type": "object" }');
  });

  it("proves generation identity, history/supersedes, exact-checkout, environment, IAM, and reachability guards", () => {
    const output = runSelfTest(COMMON);
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"generationId": "PASS"');
    expect(output).toContain('"reentryHistory": "PASS"');
    expect(output).toContain('"wrongHeadGuard": "PASS"');
    expect(output).toContain('"dirtyWorktreeGuard": "PASS"');
    expect(output).toContain('"wrongNodeVersionGuard": "PASS"');
    expect(output).toContain('"outputPathGuard": "PASS"');
    expect(output).toContain('"immutableFilenameGuard": "PASS"');
    expect(output).toContain('"forbiddenEnvironmentGuards": "PASS"');
    expect(output).toContain('"awsPrincipalSanitization": "PASS"');
    expect(output).toContain('"iamAccessDeniedNegativeControls": "PASS"');
    expect(output).toContain('"releaseFreezeClassification": "PASS"');
    expect(output).toContain('"evidenceGitBlobIdentity": "PASS"');
    expect(output).toContain('"evidenceRevisionReachability": "PASS"');
  });

  it("validates Phase 52 schema and rejects broken lineage", () => {
    const output = runSelfTest(VALIDATOR);
    expect(output).toContain('"schemaContract": "PASS"');
    expect(output).toContain('"brokenHistoryGuard": "PASS"');
    expect(output).toContain('"unknownRecordTypeGuard": "PASS"');
  });

  it("keeps the real-S3 Gate deterministic and fail-closed without requiring real AWS or Docker", () => {
    const output = runSelfTest(REAL_S3_RUNNER);
    expect(output).toContain('"exactCheckoutGuard": "PASS"');
    expect(output).toContain('"optionalDockerEvidence": "PASS"');
    expect(output).toContain('"testedRevisionOwnership": "PASS"');
    expect(output).toContain('"awsPrincipalSanitization": "PASS"');
    expect(output).toContain('"iamAccessDeniedVerification": "PASS"');
    expect(output).toContain('"noSuchBucketNegativeControl": "PASS"');
    expect(output).toContain('"rawOutputOutsideCheckout": "PASS"');
  });

  it("keeps the environment Gate on AWS S3 and protects the Phase 50 canonical record", () => {
    const output = runSelfTest(ENVIRONMENT_RUNNER);
    expect(output).toContain('"exactCheckoutGuard": "PASS"');
    expect(output).toContain('"dockerEvidenceRequired": "PASS"');
    expect(output).toContain('"testedRevisionDetectedByVerifier": "PASS"');
    expect(output).toContain('"testedRevisionEnvGuard": "PASS"');
    expect(output).toContain('"endpointGuard": "PASS"');
    expect(output).toContain('"outputPathGuard": "PASS"');
    expect(output).toContain('"phase50EvidenceOverwriteGuard": "PASS"');
  });

  it("prepares the Phase 52-3 system release candidate without publishing the canonical release record", () => {
    const output = runSelfTest(SYSTEM_RELEASE_GENERATOR);
    expect(output).toContain('"result": "PASS"');
    expect(output).toContain('"handoffParsing": "PASS"');
    expect(output).toContain('"policyReferenceInterpretation": "PASS"');
    expect(output).toContain('"canonicalGitProcessClassification": "PASS"');
    expect(output).toContain('"noncanonicalProcessDetection": "PASS"');
    expect(output).toContain('"singleResultField": "PASS"');
    expect(output).toContain('"dryRunOnlyBoundary": "PASS"');
  });

  it("owns tested revisions, output paths, AWS privacy, IAM denial, release-freeze, and Phase 52-3 closure in source", () => {
    const common = readFileSync(COMMON, "utf8");
    const realS3 = readFileSync(REAL_S3_RUNNER, "utf8");
    const environment = readFileSync(ENVIRONMENT_RUNNER, "utf8");
    const generator = readFileSync(SYSTEM_RELEASE_GENERATOR, "utf8");

    expect(common).toContain("PHASE49_REAL_S3_TESTED_GIT_REVISION must be unset");
    expect(common).toContain("PHASE50_TESTED_GIT_REVISION must be unset");
    expect(common).toContain("PHASE50_S3_CONFORMANCE_ENDPOINT must be unset");
    expect(common).toContain("normalizedPrincipalArnSha256");
    expect(common).toContain("AccessDenied");
    expect(common).toContain("merge-base");
    expect(common).toContain("docs/contracts/");
    expect(common).toContain("tsconfig");
    expect(realS3).toContain("phase49/artifacts");
    expect(realS3).toContain("delete-object");
    expect(realS3).toContain("list-objects-v2");
    expect(environment).toContain("PHASE50_ENVIRONMENT_CONFORMANCE_RECORD");
    expect(environment).toContain("verify:phase50:environment");
    expect(generator).toContain("validate-system-release-compatibility.mjs");
    expect(generator).toContain("--validate-only");
    expect(generator).toContain("policyReference");
    expect(generator).toContain("assertNoReleaseFreezeViolations");
    expect(generator).toContain("agentProcessLaunchSiteCount: 0");
    expect(generator).toContain("design-and-implementation-separation-only");
    expect(generator).toContain("canonicalRecordWritten: false");
  });
});
