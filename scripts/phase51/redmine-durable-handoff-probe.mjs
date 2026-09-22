#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { root: process.cwd(), input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--input") options.input = resolve(argv[++index]);
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function readInput(path) {
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  return JSON.parse(readFileSync(0, "utf8"));
}

function assertInput(input) {
  if (!input || typeof input !== "object") fail("Probe input must be an object");
  if (!Number.isSafeInteger(input.issueId) || input.issueId <= 0) fail("issueId must be a positive safe integer");
  if (typeof input.repository !== "string" || input.repository.trim() === "") fail("repository is required");
  if (!/^redmine-user:[1-9][0-9]*$/u.test(input.approverIdentity)) fail("approverIdentity is invalid");
  if (!Number.isSafeInteger(input.briefRevision) || input.briefRevision <= 0) fail("briefRevision must be positive");
  if (typeof input.persistedRevision !== "string" || input.persistedRevision.trim() === "") fail("persistedRevision is required");
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.requirementsFingerprint)) fail("requirementsFingerprint is invalid");
  if (typeof input.approvedAt !== "string" || Number.isNaN(Date.parse(input.approvedAt))) fail("approvedAt is invalid");
}

export async function captureRedmineDurableHandoff(root, input) {
  assertInput(input);

  const lifecycleModule = await import(
    pathToFileURL(resolve(root, "dist/src/agent-brief/lifecycle-metadata.js")).href
  );
  const writerModule = await import(
    pathToFileURL(resolve(root, "dist/src/redmine/issue-custom-field-writer.js")).href
  );

  const fieldNames = lifecycleModule.AGENT_BRIEF_LIFECYCLE_FIELD_NAMES;
  const ids = {
    lifecycle: 201,
    approvedBy: 202,
    approvedAt: 203,
    approvedBriefRevision: 204,
    approvedPersistedRevision: 205,
    approvedRequirementsFingerprint: 206,
  };

  const issue = {
    id: input.issueId,
    project: { id: 414, name: "Redmine" },
    customFields: [
      { id: ids.lifecycle, name: fieldNames.lifecycle, value: "Brief Ready" },
      { id: ids.approvedBy, name: fieldNames.approvedBy, value: "" },
      { id: ids.approvedAt, name: fieldNames.approvedAt, value: "" },
      { id: ids.approvedBriefRevision, name: fieldNames.approvedBriefRevision, value: "" },
      { id: ids.approvedPersistedRevision, name: fieldNames.approvedPersistedRevision, value: "" },
      { id: ids.approvedRequirementsFingerprint, name: fieldNames.approvedRequirementsFingerprint, value: "" },
    ],
  };

  let capturedRequest = null;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    capturedRequest = {
      url: String(url),
      method: init?.method ?? null,
      body,
    };
    for (const update of body.issue?.custom_fields ?? []) {
      const target = issue.customFields.find((field) => field.id === update.id);
      if (!target) fail(`Production writer attempted unknown custom field id ${update.id}`);
      target.value = update.value;
    }
    return new Response(null, { status: 204 });
  };

  const writer = new writerModule.RedmineHttpAgentBriefLifecycleWriter({
    baseUrl: "https://phase51.invalid",
    apiKey: "phase51-probe-key",
    fetchImpl,
  });
  const reader = {
    async getIssue() { return issue; },
    async getProject() { return { id: 414, name: "Redmine", identifier: "redmine" }; },
  };
  const guard = {
    canRegisterWriteTools() { return true; },
    isProjectAllowed() { return true; },
  };
  const boundary = new lifecycleModule.AgentBriefLifecycleMetadataBoundary(reader, writer, guard);
  const snapshot = await boundary.transition(input.issueId, {
    targetLifecycle: "Ready for Agent",
    approvalMetadata: {
      approverIdentity: input.approverIdentity,
      approvedAt: input.approvedAt,
      approvedBriefRevision: input.briefRevision,
      approvedPersistedRevision: input.persistedRevision,
      approvedRequirementsFingerprint: input.requirementsFingerprint,
    },
  });

  if (!snapshot.handoffEligible || snapshot.lifecycle !== "Ready for Agent") {
    fail("Production lifecycle boundary did not produce a handoff-eligible Ready for Agent snapshot");
  }
  if (!capturedRequest) fail("Production HTTP writer did not emit a Redmine request");

  const nameById = new Map(issue.customFields.map((field) => [field.id, field.name]));
  const durableFields = capturedRequest.body.issue.custom_fields.map((field) => ({
    fieldName: nameById.get(field.id) ?? `unknown:${field.id}`,
    value: field.value,
  }));

  return {
    handoffIdentity: {
      repository: input.repository,
      redmine_issue_id: input.issueId,
      brief_revision: snapshot.approvalMetadata.approvedBriefRevision,
      persisted_revision: snapshot.approvalMetadata.approvedPersistedRevision,
      requirements_fingerprint: snapshot.approvalMetadata.approvedRequirementsFingerprint,
      approver_identity: snapshot.approvalMetadata.approverIdentity,
      approved_at: snapshot.approvalMetadata.approvedAt,
    },
    durableRepresentation: {
      lifecycle: snapshot.lifecycle,
      fields: durableFields,
    },
    productionBindings: {
      lifecycleBoundary: "src/agent-brief/lifecycle-metadata.ts#AgentBriefLifecycleMetadataBoundary",
      redmineWriter: "src/redmine/issue-custom-field-writer.ts#RedmineHttpAgentBriefLifecycleWriter",
    },
    transportCapture: capturedRequest,
  };
}

if (process.argv[1]?.endsWith("redmine-durable-handoff-probe.mjs")) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const input = readInput(options.input);
    const result = await captureRedmineDurableHandoff(options.root, input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
