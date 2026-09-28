import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PHASE53 = resolve(ROOT, "scripts/phase53");
const SPEC = resolve(
  PHASE53,
  "phase53-4-redmine-administrative-provisioning-spec.json",
);
const CONFIG = resolve(
  PHASE53,
  "phase53-4-redmine-administrative-provisioning.example.json",
);
const SCRIPT = resolve(PHASE53, "redmine-administrative-provisioning.rb");
const RUNBOOK = resolve(PHASE53, "README-5451.md");

interface BriefFieldSpec {
  name: string;
  fieldFormat: string;
  multiple: boolean;
  required: boolean;
  filter: boolean;
  possibleValues?: string[];
}

interface ProvisioningSpec {
  schemaVersion: number;
  ticket: number;
  project: { id: number; identifier: string };
  tracker: { id: number; name: string };
  briefFields: BriefFieldSpec[];
  executionLifecycleField: { name: string; filter: boolean };
  targetRepositoryField: {
    id: number;
    name: string;
    requiredFieldFormat: string;
    requiredAllowedValue: string;
  };
}

describe("Phase 53-4 production Redmine administrative provisioning", () => {
  it("keeps the six Brief mappings aligned with the canonical Phase 38 names and types", () => {
    const spec = JSON.parse(readFileSync(SPEC, "utf8")) as ProvisioningSpec;

    expect(spec.schemaVersion).toBe(1);
    expect(spec.ticket).toBe(5451);
    expect(spec.project).toEqual({ id: 414, identifier: "mcp_redmine" });
    expect(spec.tracker).toEqual({ id: 2, name: "\u6a5f\u80fd" });
    expect(spec.briefFields).toEqual([
      {
        name: "Agent Brief Lifecycle",
        fieldFormat: "list",
        multiple: false,
        required: false,
        filter: true,
        possibleValues: ["Brief Draft", "Brief Ready", "Ready for Agent"],
      },
      {
        name: "Brief Approved By",
        fieldFormat: "string",
        multiple: false,
        required: false,
        filter: false,
      },
      {
        name: "Brief Approved At",
        fieldFormat: "string",
        multiple: false,
        required: false,
        filter: false,
      },
      {
        name: "Approved Brief Revision",
        fieldFormat: "int",
        multiple: false,
        required: false,
        filter: false,
      },
      {
        name: "Approved Persisted Revision",
        fieldFormat: "string",
        multiple: false,
        required: false,
        filter: false,
      },
      {
        name: "Approved Req Fingerprint",
        fieldFormat: "string",
        multiple: false,
        required: false,
        filter: false,
      },
    ]);
  });

  it("keeps lifecycle filters and CF25 php provisioning explicit", () => {
    const spec = JSON.parse(readFileSync(SPEC, "utf8")) as ProvisioningSpec;

    expect(spec.executionLifecycleField).toEqual({
      name: "Agent Execution Lifecycle",
      filter: true,
    });
    expect(spec.targetRepositoryField).toEqual({
      id: 25,
      name: "Target Repository",
      requiredFieldFormat: "list",
      requiredAllowedValue: "php",
    });
  });

  it("requires an explicit visibility decision before any administrative apply", () => {
    const config = JSON.parse(readFileSync(CONFIG, "utf8")) as {
      visibility: Record<string, { mode: string }>;
      administrativeBoundary: {
        normalProcessAdminCredentialMustRemainUnset: boolean;
        principalVerificationTicket: number;
      };
    };

    expect(config.visibility.briefFields?.mode).toBe("review-required");
    expect(config.visibility.targetRepository?.mode).toBe("review-required");
    expect(config.administrativeBoundary).toEqual({
      normalProcessAdminCredentialMustRemainUnset: true,
      principalVerificationTicket: 5453,
    });
  });

  it("binds mutation to an approved digest and fails closed on drift or unsafe field conversion", () => {
    const source = readFileSync(SCRIPT, "utf8");

    expect(source).toContain("PHASE53_5451_APPROVED_PLAN_SHA256");
    expect(source).toContain("approved plan digest does not match plan file");
    expect(source).toContain("configuration drifted after approval");
    expect(source).toContain("case-insensitive custom-field collision");
    expect(source).toContain("no type conversion is performed");
    expect(source).toContain("changing Target Repository field type is a separate decision");
    expect(source).toContain("append_target_repository_value");
    expect(source).toContain("ActiveRecord::Base.transaction");
  });

  it("does not turn Phase 53-4 into principal verification or an admin credential distribution path", () => {
    const source = readFileSync(SCRIPT, "utf8");
    const runbook = readFileSync(RUNBOOK, "utf8");

    expect(source).not.toContain("REDMINE_API_KEY");
    expect(source).not.toContain("Token.create");
    expect(source).toContain('"principalVerificationOwnedByTicket" => 5453');
    expect(source).toContain('"principalVerificationPerformedByThisTool" => false');
    expect(runbook).toContain("Actual principal visibility, permission, filter behavior");
    expect(runbook).toContain("At this point stop and obtain explicit human approval");
  });
});
