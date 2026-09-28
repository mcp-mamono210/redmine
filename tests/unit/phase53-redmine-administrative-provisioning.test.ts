import { execFileSync } from "node:child_process";
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
const POLICY = resolve(PHASE53, "target-repository-policy.rb");
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
    supportedExistingFormats: string[];
    multiple: boolean;
    requiredAllowedValue: {
      value: string;
      appliesWhenFieldFormat: string;
    };
  };
}

function evaluateTargetRepositoryPolicy(
  fieldFormat: string,
  multiple: boolean,
  possibleValues: string[],
) {
  const source = [
    "require \"json\"",
    "input = JSON.parse(STDIN.read)",
    "puts JSON.generate(Phase53TargetRepositoryPolicy.evaluate(**input.transform_keys(&:to_sym)))",
  ].join("; ");
  return JSON.parse(
    execFileSync("ruby", ["-r", POLICY, "-e", source], {
      input: JSON.stringify({
        field_format: fieldFormat,
        multiple,
        possible_values: possibleValues,
        supported_formats: ["string", "list"],
        required_allowed_value: "php",
      }),
      encoding: "utf8",
    }),
  ) as { blockers: string[]; actions: unknown[]; preservedPossibleValues: string[] };
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
      supportedExistingFormats: ["string", "list"],
      multiple: false,
      requiredAllowedValue: {
        value: "php",
        appliesWhenFieldFormat: "list",
      },
    });
  });

  it.each([
    ["string", false, ["ai-agent-runner", "redmine"]],
    ["list", false, ["ai-agent-runner", "redmine"]],
    ["list", false, ["ai-agent-runner", "redmine", "php"]],
    ["int", false, []],
    ["string", true, []],
  ])(
    "evaluates CF25 %s / multiple=%s with existing values %j",
    (fieldFormat, multiple, possibleValues) => {
      const result = evaluateTargetRepositoryPolicy(
        fieldFormat,
        multiple,
        possibleValues,
      );

      if (fieldFormat === "string" && multiple === false) {
        expect(result.blockers).toEqual([]);
        expect(result.actions).toEqual([]);
      } else if (fieldFormat === "list" && multiple === false && !possibleValues.includes("php")) {
        expect(result.blockers).toEqual([]);
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0]).toMatchObject({
          action: "append_target_repository_value",
          append: "php",
        });
      } else if (fieldFormat === "list" && possibleValues.includes("php")) {
        expect(result.blockers).toEqual([]);
        expect(result.actions).toEqual([]);
      } else {
        expect(result.blockers).toHaveLength(1);
        expect(result.actions).toEqual([]);
      }

      expect(result.preservedPossibleValues).toEqual(possibleValues);
    },
  );

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
    const policySource = readFileSync(POLICY, "utf8");

    expect(source).toContain("PHASE53_5451_APPROVED_PLAN_SHA256");
    expect(source).toContain("approved plan digest does not match plan file");
    expect(source).toContain("configuration drifted after approval");
    expect(source).toContain("case-insensitive custom-field collision");
    expect(source).toContain("no type conversion is performed");
    expect(policySource).toContain("changing Target Repository field type is a separate decision");
    expect(policySource).toContain("append_target_repository_value");
    expect(source).toContain('field_format == "list"');
    expect(source).toContain("supportedExistingFormats");
    expect(source).toContain("ActiveRecord::Base.transaction");
  });

  it("preserves CF25 values and continues normal scope/visibility planning", () => {
    const source = readFileSync(SCRIPT, "utf8");

    expect(source).toContain('plan_scope(context, by_id, actions)');
    expect(source).toContain('plan_visibility(by_id, visibility_policy, visibility_roles, actions)');
    expect(source).toContain('field.possible_values = values + [required_value] unless values.include?(required_value)');
    expect(source).toContain('if field.field_format == "list"');
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
