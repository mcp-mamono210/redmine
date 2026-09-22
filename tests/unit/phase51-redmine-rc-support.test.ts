import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PHASE51 = resolve(ROOT, "scripts/phase51");

const SCRIPTS = [
  "redmine-producer-profile.mjs",
  "redmine-durable-handoff-probe.mjs",
  "redmine-requirements-fingerprint-probe.mjs",
  "verify-redmine-rc-support.mjs",
  "generate-redmine-rc-evidence.mjs",
];

describe("Phase 51-2 Redmine MCP RC verification support", () => {
  it("keeps every verification-support script syntactically valid", () => {
    for (const script of SCRIPTS) {
      expect(() =>
        execFileSync(process.execPath, ["--check", resolve(PHASE51, script)], {
          encoding: "utf8",
        }),
      ).not.toThrow();
    }
  });

  it("derives producer field names from production lifecycle metadata rather than a copied field-name table", () => {
    const script = readFileSync(
      resolve(PHASE51, "redmine-producer-profile.mjs"),
      "utf8",
    );

    expect(script).toContain("AGENT_BRIEF_LIFECYCLE_FIELD_NAMES");
    expect(script).toContain("inferConstraintId");
    expect(script).not.toContain('"Brief Approved By"');
    expect(script).not.toContain('"Brief Approved At"');
    expect(script).not.toContain('"Approved Req Fingerprint"');
  });

  it("captures durable representation through the production lifecycle boundary and HTTP writer", () => {
    const script = readFileSync(
      resolve(PHASE51, "redmine-durable-handoff-probe.mjs"),
      "utf8",
    );

    expect(script).toContain("AgentBriefLifecycleMetadataBoundary");
    expect(script).toContain("RedmineHttpAgentBriefLifecycleWriter");
    expect(script).toContain("fetchImpl");
    expect(script).toContain("transportCapture");
  });

  it("binds requirements fingerprint verification to the production implementation", () => {
    const script = readFileSync(
      resolve(PHASE51, "redmine-requirements-fingerprint-probe.mjs"),
      "utf8",
    );

    expect(script).toContain("calculateAgentBriefRequirementsFingerprint");
    expect(script).toContain("AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION");
  });

  it("keeps RC identity and verification evidence bound to an exact post-support source revision", () => {
    const script = readFileSync(
      resolve(PHASE51, "generate-redmine-rc-evidence.mjs"),
      "utf8",
    );

    expect(script).toContain("exactSourceRevision");
    expect(script).toContain("latestReleasedIdentity");
    expect(script).toContain("runtimeArtifactComparison");
    expect(script).toContain("publicContractComparison");
    expect(script).toContain("requiredContractIdentities");
    expect(script).toContain("requirementsFingerprintImplementationSources");
    expect(script).toContain('HEAD=${head}, expected ${options.sourceRevision}');
  });

  it("keeps the Phase 51 contract registry strict-valid while preparing the Redmine RC", () => {
    const output = execFileSync(
      process.execPath,
      [
        resolve(PHASE51, "validate-system-release-compatibility.mjs"),
        "--root",
        ROOT,
        "--mode",
        "strict",
        "--negative-controls",
      ],
      { encoding: "utf8" },
    );

    expect(output).toContain("compatibility contract validation PASS (strict)");
  });
});
