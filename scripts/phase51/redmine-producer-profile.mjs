#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function baselineValues() {
  return {
    approvedBy: "redmine-user:1",
    approvedAt: "2026-09-22T00:00:00Z",
    approvedBriefRevision: "1",
    approvedPersistedRevision: "opaque-persisted-revision",
    approvedRequirementsFingerprint: `sha256:${"a".repeat(64)}`,
  };
}

function makeIssue(fieldNames, overrides = {}) {
  const values = { ...baselineValues(), ...overrides };
  const ids = {
    lifecycle: 101,
    approvedBy: 102,
    approvedAt: 103,
    approvedBriefRevision: 104,
    approvedPersistedRevision: 105,
    approvedRequirementsFingerprint: 106,
  };

  return {
    id: 5102,
    project: { id: 414, name: "Redmine" },
    customFields: [
      { id: ids.lifecycle, name: fieldNames.lifecycle, value: "Ready for Agent" },
      { id: ids.approvedBy, name: fieldNames.approvedBy, value: values.approvedBy },
      { id: ids.approvedAt, name: fieldNames.approvedAt, value: values.approvedAt },
      {
        id: ids.approvedBriefRevision,
        name: fieldNames.approvedBriefRevision,
        value: values.approvedBriefRevision,
      },
      {
        id: ids.approvedPersistedRevision,
        name: fieldNames.approvedPersistedRevision,
        value: values.approvedPersistedRevision,
      },
      {
        id: ids.approvedRequirementsFingerprint,
        name: fieldNames.approvedRequirementsFingerprint,
        value: values.approvedRequirementsFingerprint,
      },
    ],
  };
}

async function acceptsValue(Boundary, fieldNames, fieldKey, value) {
  const issue = makeIssue(fieldNames, { [fieldKey]: value });
  const reader = {
    async getIssue() { return issue; },
    async getProject() { return { id: 414, name: "Redmine", identifier: "redmine" }; },
  };
  const writer = { async updateAgentBriefLifecycleFields() {} };
  const guard = {
    canRegisterWriteTools() { return true; },
    isProjectAllowed() { return true; },
  };
  const boundary = new Boundary(reader, writer, guard);
  try {
    await boundary.read(issue.id);
    return true;
  } catch {
    return false;
  }
}

async function inferConstraintId(Boundary, fieldNames, fieldKey, constraints) {
  const matches = [];
  for (const [constraintId, vectors] of Object.entries(constraints)) {
    let matched = true;
    for (const value of vectors.positive) {
      if (!(await acceptsValue(Boundary, fieldNames, fieldKey, value))) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    for (const value of vectors.negative) {
      if (await acceptsValue(Boundary, fieldNames, fieldKey, value)) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(constraintId);
  }

  if (matches.length !== 1) {
    fail(`Expected exactly one canonical constraint match for ${fieldKey}; got ${matches.join(", ") || "none"}`);
  }
  return matches[0];
}

export async function deriveRedmineProducerProfile(root) {
  const profilePath = resolve(root, "docs/contracts/system-release-handoff-profile.json");
  const canonical = JSON.parse(readFileSync(profilePath, "utf8"));

  const lifecycleModule = await import(
    pathToFileURL(resolve(root, "dist/src/agent-brief/lifecycle-metadata.js")).href
  );
  const fingerprintModule = await import(
    pathToFileURL(resolve(root, "dist/src/agent-brief/requirements-fingerprint.js")).href
  );

  const Boundary = lifecycleModule.AgentBriefLifecycleMetadataBoundary;
  const fieldNames = lifecycleModule.AGENT_BRIEF_LIFECYCLE_FIELD_NAMES;
  const lifecycleStates = lifecycleModule.AGENT_BRIEF_LIFECYCLE_STATES;

  if (!Boundary || !fieldNames || !Array.isArray(lifecycleStates)) {
    fail("Production lifecycle metadata exports required by the Phase 51 producer probe are unavailable");
  }
  if (!lifecycleStates.includes("Ready for Agent")) {
    fail("Production lifecycle does not expose Ready for Agent");
  }

  const approval = {};
  const constraintMatches = {};
  for (const key of Object.keys(canonical.approval)) {
    if (!Object.hasOwn(fieldNames, key)) fail(`Production field-name mapping is missing ${key}`);
    const constraintId = await inferConstraintId(
      Boundary,
      fieldNames,
      key,
      canonical.constraints,
    );
    constraintMatches[key] = constraintId;
    approval[key] = {
      fieldName: fieldNames[key],
      constraint: structuredClone(canonical.approval[key].constraint),
    };
    if (approval[key].constraint.constraintId !== constraintId) {
      fail(`Production behavior for ${key} matches ${constraintId}, not ${approval[key].constraint.constraintId}`);
    }
  }

  const sampleInput = {
    format_version: 1,
    source: {
      redmine_issue_id: 5102,
      source_updated_on: "2026-09-22T00:00:00Z",
      project: { id: 414, name: "Redmine" },
      tracker: { id: 2, name: "Feature" },
      subject: "Phase 51 producer profile fingerprint fixture",
      description: "Deterministic production fingerprint capability check.",
    },
    requirement_custom_fields: [],
    journal_notes: [],
    relations: [],
    children: [],
    projection: {
      requirement_custom_field_ids: [],
      redacted_paths: [],
      truncated_paths: [],
      omitted: {
        requirement_custom_fields: 0,
        journal_notes: 0,
        relations: 0,
        children: 0,
      },
    },
  };
  const sampleFingerprint = fingerprintModule.calculateAgentBriefRequirementsFingerprint(sampleInput);
  if (!/^sha256:[0-9a-f]{64}$/u.test(sampleFingerprint)) {
    fail("Production requirements fingerprint does not use canonical sha256 lowercase-hex representation");
  }
  if (
    fingerprintModule.AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION !==
    canonical.requirementsFingerprint.inputFormatVersion
  ) {
    fail("Production requirements fingerprint input-format version drift");
  }

  const handoffSemanticProfile = {
    schemaVersion: canonical.schemaVersion,
    profileId: canonical.profileId,
    lifecycle: {
      fieldName: fieldNames.lifecycle,
      readyForAgentValue: "Ready for Agent",
    },
    approval,
    customFieldSemantics: structuredClone(canonical.customFieldSemantics),
    handoffIdentity: structuredClone(canonical.handoffIdentity),
    requirementsFingerprint: structuredClone(canonical.requirementsFingerprint),
    constraints: structuredClone(canonical.constraints),
    contractReferences: structuredClone(canonical.contractReferences),
  };

  return {
    handoffSemanticProfile,
    constraintConformance: {
      result: "PASS",
      matchedConstraintIds: constraintMatches,
    },
    productionBindings: {
      lifecycleMetadata: "src/agent-brief/lifecycle-metadata.ts",
      requirementsFingerprint: "src/agent-brief/requirements-fingerprint.ts",
    },
  };
}

if (process.argv[1]?.endsWith("redmine-producer-profile.mjs")) {
  try {
    const { root } = parseArgs(process.argv.slice(2));
    const result = await deriveRedmineProducerProfile(root);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
