#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { validateSchema } from "./validate-system-release-compatibility.mjs";

const RECORD_TYPE = "cross-component-compatibility";
const REDMINE_REPOSITORY = "mcp-mamono210/redmine";
const RUNNER_REPOSITORY = "mcp-mamono210/ai-agent-runner";
const DEFAULT_OUTPUT = "docs/verification/phase51-cross-component-compatibility.json";
const SHA1 = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options.set(name, true);
    } else {
      options.set(name, next);
      index += 1;
    }
  }
  return options;
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    fail(`--${name} is required`);
  }
  return resolve(value);
}

function optionalString(options, name) {
  const value = options.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertExactCleanCheckout(root, expectedRevision, label) {
  if (!SHA1.test(expectedRevision)) fail(`${label} evidence does not contain an exact Git revision`);
  const head = git(root, ["rev-parse", "HEAD"]);
  if (head !== expectedRevision) {
    fail(`${label} checkout revision mismatch: HEAD=${head}, expected=${expectedRevision}`);
  }
  const dirty = git(root, ["status", "--porcelain"]);
  if (dirty !== "") {
    fail(`${label} RC checkout must be clean before compatibility verification`);
  }
}

function buildExactCheckout(root) {
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
}

function runJson(script, args, { cwd, input = null } = {}) {
  const stdout = execFileSync(process.execPath, [script, ...args], {
    cwd,
    input: input === null ? undefined : `${JSON.stringify(input)}\n`,
    encoding: "utf8",
    stdio: [input === null ? "ignore" : "pipe", "pipe", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function gitBlobSha(root, revision, path) {
  if (!SHA1.test(revision)) fail(`Invalid sourceRevision for ${path}: ${revision}`);
  git(root, ["cat-file", "-e", `${revision}^{commit}`]);
  const sha = git(root, ["rev-parse", `${revision}:${path}`]);
  if (!SHA1.test(sha)) fail(`Git did not return a blob SHA for ${path} at ${revision}`);
  if (git(root, ["cat-file", "-t", sha]) !== "blob") {
    fail(`Expected blob object for ${path} at ${revision}`);
  }
  return sha;
}

export function canonicalGenerationId(recordType, generation, current) {
  const canonical = JSON.stringify({ recordType, generation, current });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function assertEnvelopeIntegrity(record, schema, label) {
  validateSchema(record, schema);
  const expected = canonicalGenerationId(record.recordType, record.generation, record.current);
  if (record.generationId !== expected) {
    fail(`${label} generationId does not match recordType + generation + current`);
  }
}

function stableContractIdentity(entry) {
  return {
    contractId: entry.contractId,
    repository: entry.repository,
    path: entry.path,
    semanticRevision: entry.semanticRevision,
    sourceRevision: entry.sourceRevision,
    sourceBlobSha: entry.sourceBlobSha,
  };
}

function sortedContractIdentities(entries) {
  return entries.map(stableContractIdentity).sort((a, b) => a.contractId.localeCompare(b.contractId));
}

function addDrift(drifts, id, classification, scope, message) {
  drifts.push({ id, classification, scope, message, blocking: true });
}

export function compareProfiles(canonical, producer, consumer) {
  const drifts = [];
  if (!isDeepStrictEqual(canonical, producer)) {
    addDrift(
      drifts,
      "layerA.contract-vs-producer",
      "implementation bug",
      "redmine-producer-profile",
      "Redmine producer semantic profile differs from the canonical expected handoff profile",
    );
  }
  if (!isDeepStrictEqual(canonical, consumer)) {
    addDrift(
      drifts,
      "layerA.contract-vs-consumer",
      "implementation bug",
      "agent-runner-consumer-profile",
      "Agent Runner consumer semantic profile differs from the canonical expected handoff profile",
    );
  }
  return drifts;
}

function firstPositive(profile, constraintId) {
  const value = profile.constraints?.[constraintId]?.positive?.[0];
  if (typeof value !== "string" || value === "") {
    fail(`Canonical handoff profile has no positive vector for ${constraintId}`);
  }
  return value;
}

export function buildRequirementsFixture() {
  return {
    format_version: 1,
    source: {
      redmine_issue_id: 5102,
      source_updated_on: "2026-09-22T00:00:00Z",
      project: { id: 414, name: "Redmine" },
      tracker: { id: 2, name: "Feature" },
      subject: "Phase 51 cross-component compatibility fixture",
      description: "Deterministic contract-derived requirements fingerprint fixture.",
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
}

export function buildHandoffFixture(profile, requirementsFingerprint) {
  const briefRevisionRaw = firstPositive(profile, "positive-safe-base10-integer-v1");
  const briefRevision = Number(briefRevisionRaw);
  if (!Number.isSafeInteger(briefRevision) || briefRevision <= 0) {
    fail("Canonical positive Brief revision vector is not a positive safe integer");
  }
  return {
    issueId: 5102,
    repository: REDMINE_REPOSITORY,
    approverIdentity: firstPositive(profile, "redmine-principal-v1"),
    approvedAt: firstPositive(profile, "rfc3339-offset-timestamp-v1"),
    briefRevision,
    persistedRevision: firstPositive(profile, "nonblank-opaque-string-v1"),
    requirementsFingerprint,
  };
}

export function expectedHandoffIdentity(fixture) {
  return {
    repository: fixture.repository,
    redmine_issue_id: fixture.issueId,
    brief_revision: fixture.briefRevision,
    persisted_revision: fixture.persistedRevision,
    requirements_fingerprint: fixture.requirementsFingerprint,
    approver_identity: fixture.approverIdentity,
    approved_at: fixture.approvedAt,
  };
}

export function expectedDurableRepresentation(profile, fixture) {
  return {
    lifecycle: profile.lifecycle.readyForAgentValue,
    fields: [
      { fieldName: profile.lifecycle.fieldName, value: profile.lifecycle.readyForAgentValue },
      { fieldName: profile.approval.approvedBy.fieldName, value: fixture.approverIdentity },
      { fieldName: profile.approval.approvedAt.fieldName, value: fixture.approvedAt },
      {
        fieldName: profile.approval.approvedBriefRevision.fieldName,
        value: String(fixture.briefRevision),
      },
      {
        fieldName: profile.approval.approvedPersistedRevision.fieldName,
        value: fixture.persistedRevision,
      },
      {
        fieldName: profile.approval.approvedRequirementsFingerprint.fieldName,
        value: fixture.requirementsFingerprint,
      },
    ],
  };
}

export function expectedRunnerValidation(fixture) {
  return {
    ok: true,
    handoff: {
      issueId: fixture.issueId,
      repository: fixture.repository,
      approvedRequirementsFingerprint: fixture.requirementsFingerprint,
      approval: {
        approverIdentity: fixture.approverIdentity,
        approvedAt: fixture.approvedAt,
        briefRevision: fixture.briefRevision,
        persistedRevision: fixture.persistedRevision,
      },
      opaque: {
        approverIdentity: fixture.approverIdentity,
        approvedAt: fixture.approvedAt,
        approvedBriefRevision: fixture.briefRevision,
        approvedPersistedRevision: fixture.persistedRevision,
      },
    },
  };
}

function runnerProbeInput(profile, fixture) {
  return {
    issueId: fixture.issueId,
    projectId: 414,
    projectName: "Redmine",
    repository: fixture.repository,
    fields: {
      lifecycle: profile.lifecycle.readyForAgentValue,
      approvedBy: fixture.approverIdentity,
      approvedAt: fixture.approvedAt,
      approvedBriefRevision: String(fixture.briefRevision),
      approvedPersistedRevision: fixture.persistedRevision,
      approvedRequirementsFingerprint: fixture.requirementsFingerprint,
    },
    expectedReference: {
      repository: fixture.repository,
      issueId: fixture.issueId,
      briefRevision: fixture.briefRevision,
      persistedRevision: fixture.persistedRevision,
      requirementsFingerprint: fixture.requirementsFingerprint,
    },
  };
}

function repositoryRoot(repository, redmineRoot, runnerRoot) {
  if (repository === REDMINE_REPOSITORY) return redmineRoot;
  if (repository === RUNNER_REPOSITORY) return runnerRoot;
  fail(`Unknown repository identity in Phase 51 evidence: ${repository}`);
}

function declaredSourceBlobSha(source) {
  return source.blobSha ?? source.sourceBlobSha;
}

function verifySourceIdentity(source, redmineRoot, runnerRoot, drifts, idPrefix) {
  const root = repositoryRoot(source.repository, redmineRoot, runnerRoot);
  const actual = gitBlobSha(root, source.sourceRevision, source.path);
  const declaredBlobSha = declaredSourceBlobSha(source);
  if (!SHA1.test(declaredBlobSha ?? "")) {
    addDrift(
      drifts,
      `${idPrefix}.${source.path}`,
      "documentation drift",
      source.repository,
      `Declared blob identity is missing or invalid for ${source.path}`,
    );
    return;
  }
  if (actual !== declaredBlobSha) {
    addDrift(
      drifts,
      `${idPrefix}.${source.path}`,
      "documentation drift",
      source.repository,
      `Declared blob ${declaredBlobSha} differs from actual Git blob ${actual} for ${source.path}`,
    );
  }
}

function verifyBindingIdentity(binding, runnerRoot, drifts, idPrefix) {
  const path = binding.module;
  const actual = gitBlobSha(runnerRoot, binding.sourceRevision, path);
  if (actual !== binding.blobSha) {
    addDrift(
      drifts,
      `${idPrefix}.${path}`,
      "documentation drift",
      RUNNER_REPOSITORY,
      `Production binding blob ${binding.blobSha} differs from actual Git blob ${actual} for ${path}`,
    );
  }
}

function verifyProfileContractReferences(profile, registry, drifts) {
  const byId = new Map(registry.contracts.map((entry) => [entry.contractId, entry]));
  for (const reference of profile.contractReferences) {
    const current = byId.get(reference.contractId);
    if (!current || current.semanticRevision !== reference.semanticRevision) {
      addDrift(
        drifts,
        `profile.contract-reference.${reference.contractId}`,
        "documentation drift",
        "canonical-handoff-profile",
        `Canonical handoff profile references stale or unknown contract revision for ${reference.contractId}`,
      );
    }
  }
}

function assertComponentEvidenceConsistency(identity, verification, label) {
  if (identity.current.exactSourceRevision !== verification.current.exactSourceRevision) {
    fail(`${label} RC identity and RC verification source revisions differ`);
  }
  if (identity.current.componentVersion !== verification.current.componentVersion) {
    fail(`${label} RC identity and RC verification component versions differ`);
  }
  if (verification.current.result !== "PASS") {
    fail(`${label} RC verification is not PASS`);
  }
}

function initialOrReentryEnvelope(current, outputPath, options, evidenceSchema) {
  if (!existsSync(outputPath)) {
    const generation = 1;
    const record = {
      schemaVersion: 1,
      recordType: RECORD_TYPE,
      generation,
      generationId: canonicalGenerationId(RECORD_TYPE, generation, current),
      current,
      history: [],
      supersedes: null,
    };
    validateSchema(record, evidenceSchema);
    return record;
  }

  if (options.get("replace-existing") !== true) {
    fail(`${outputPath} already exists; use --replace-existing with an invalidation reason for re-entry`);
  }
  const invalidationReason = optionalString(options, "invalidation-reason");
  if (invalidationReason === null) {
    fail("--invalidation-reason is required with --replace-existing");
  }
  const defectRaw = optionalString(options, "invalidating-defect-issue-id");
  const defectIssueId = defectRaw === null ? null : Number(defectRaw);
  if (defectRaw !== null && (!Number.isSafeInteger(defectIssueId) || defectIssueId <= 0)) {
    fail("--invalidating-defect-issue-id must be a positive safe integer");
  }

  const previous = readJson(outputPath);
  assertEnvelopeIntegrity(previous, evidenceSchema, "previous cross-component compatibility evidence");
  const generation = previous.generation + 1;
  const history = [
    ...previous.history,
    {
      generation: previous.generation,
      generationId: previous.generationId,
      snapshot: previous.current,
      invalidatedAt: current.verifiedAt,
      invalidationReason,
      invalidatingDefectIssueId: defectIssueId,
    },
  ];
  const record = {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    generation,
    generationId: canonicalGenerationId(RECORD_TYPE, generation, current),
    current,
    history,
    supersedes: previous.generationId,
  };
  validateSchema(record, evidenceSchema);
  return record;
}

export async function verifyCrossComponentCompatibility({
  root,
  redmineRcRoot,
  runnerRcRoot,
  verifiedAt,
}) {
  const evidenceSchema = readJson(
    resolve(root, "docs/contracts/system-release-compatibility-evidence.schema.json"),
  );
  const profile = readJson(resolve(root, "docs/contracts/system-release-handoff-profile.json"));
  const registry = readJson(
    resolve(root, "docs/contracts/system-release-compatibility-contract-registry.json"),
  );
  const redmineIdentity = readJson(
    resolve(root, "docs/verification/phase51-redmine-mcp-rc-identity.json"),
  );
  const redmineVerification = readJson(
    resolve(root, "docs/verification/phase51-redmine-mcp-rc-verification.json"),
  );
  const runnerIdentity = readJson(
    resolve(root, "docs/verification/phase51-agent-runner-rc-identity.json"),
  );
  const runnerVerification = readJson(
    resolve(root, "docs/verification/phase51-agent-runner-rc-verification.json"),
  );
  const realInfrastructure = readJson(
    resolve(root, "docs/verification/phase51-agent-runner-real-infrastructure-decision.json"),
  );

  for (const [label, record] of [
    ["Redmine MCP RC identity", redmineIdentity],
    ["Redmine MCP RC verification", redmineVerification],
    ["Agent Runner RC identity", runnerIdentity],
    ["Agent Runner RC verification", runnerVerification],
    ["Agent Runner real-infrastructure decision", realInfrastructure],
  ]) {
    assertEnvelopeIntegrity(record, evidenceSchema, label);
  }

  assertComponentEvidenceConsistency(redmineIdentity, redmineVerification, "Redmine MCP");
  assertComponentEvidenceConsistency(runnerIdentity, runnerVerification, "Agent Runner");

  const infrastructureResult = realInfrastructure.current.changeTriggeredRealS3?.result;
  if (!new Set(["PASS", "NOT_REQUIRED_WITH_REASON"]).has(infrastructureResult)) {
    fail(`Agent Runner Phase 51 real-infrastructure decision is not admissible: ${infrastructureResult}`);
  }
  if (realInfrastructure.current.exactSourceRevision !== runnerIdentity.current.exactSourceRevision) {
    fail("Agent Runner real-infrastructure decision does not reference the current RC revision");
  }

  assertExactCleanCheckout(
    redmineRcRoot,
    redmineIdentity.current.exactSourceRevision,
    "Redmine MCP",
  );
  assertExactCleanCheckout(
    runnerRcRoot,
    runnerIdentity.current.exactSourceRevision,
    "Agent Runner",
  );

  buildExactCheckout(redmineRcRoot);
  buildExactCheckout(runnerRcRoot);

  const drifts = [];
  verifyProfileContractReferences(profile, registry, drifts);

  const requiredContracts = registry.contracts.filter((entry) => entry.normative === true);
  if (requiredContracts.some((entry) => entry.registrationState !== "committed")) {
    fail("Phase 51-4 requires every normative contract registry entry to be committed");
  }
  for (const contract of requiredContracts) {
    verifySourceIdentity(contract, redmineRcRoot, runnerRcRoot, drifts, "contract-blob");
  }

  const expectedContracts = sortedContractIdentities(requiredContracts);
  for (const [label, identities] of [
    ["Redmine MCP RC identity", redmineIdentity.current.requiredContractIdentities],
    ["Agent Runner RC identity", runnerIdentity.current.requiredContractIdentities],
  ]) {
    if (!isDeepStrictEqual(sortedContractIdentities(identities), expectedContracts)) {
      addDrift(
        drifts,
        `contracts.${label.replaceAll(" ", "-").toLowerCase()}`,
        "documentation drift",
        label,
        `${label} required contract identities differ from the current canonical registry`,
      );
    }
  }

  const producerProfileResult = runJson(
    resolve(redmineRcRoot, "scripts/phase51/redmine-producer-profile.mjs"),
    ["--root", redmineRcRoot],
    { cwd: redmineRcRoot },
  );
  const runnerSupport = runJson(
    resolve(runnerRcRoot, "scripts/phase51/verify-agent-runner-rc-support.mjs"),
    [
      "--root", runnerRcRoot,
      "--canonical-profile", resolve(root, "docs/contracts/system-release-handoff-profile.json"),
      "--producer-verification", resolve(root, "docs/verification/phase51-redmine-mcp-rc-verification.json"),
    ],
    { cwd: runnerRcRoot },
  );

  drifts.push(...compareProfiles(
    profile,
    producerProfileResult.handoffSemanticProfile,
    runnerSupport.handoffConsumerProfile,
  ));

  if (producerProfileResult.constraintConformance?.result !== "PASS") {
    addDrift(drifts, "layerA.producer-constraint-conformance", "implementation bug", REDMINE_REPOSITORY, "Producer constraint conformance is not PASS");
  }
  if (runnerSupport.constraintConformance?.result !== "PASS") {
    addDrift(drifts, "layerA.consumer-constraint-conformance", "implementation bug", RUNNER_REPOSITORY, "Consumer constraint conformance is not PASS");
  }

  const producerSources = redmineVerification.current.requirementsFingerprintImplementationSources;
  const consumerEvidenceSources = runnerVerification.current.requirementsFingerprintExpectedImplementationSources;
  const consumerProbeSources = runnerSupport.requirementsFingerprintExpectedImplementationSources;
  if (!isDeepStrictEqual(producerSources, consumerEvidenceSources) ||
      !isDeepStrictEqual(producerSources, consumerProbeSources)) {
    addDrift(
      drifts,
      "layerA.fingerprint-source-binding",
      "documentation drift",
      "requirements-fingerprint-source-identity",
      "Producer and consumer requirements-fingerprint implementation source identities differ",
    );
  }
  for (const source of producerSources) {
    verifySourceIdentity(source, redmineRcRoot, runnerRcRoot, drifts, "fingerprint-source-blob");
  }

  verifyBindingIdentity(
    runnerVerification.current.productionBindings.handoffValidationEntryPoint,
    runnerRcRoot,
    drifts,
    "runner-binding",
  );
  verifyBindingIdentity(
    runnerVerification.current.productionBindings.requirementsFingerprintEntryPoint,
    runnerRcRoot,
    drifts,
    "runner-binding",
  );

  const requirementsFixture = buildRequirementsFixture();
  const redmineFingerprint = runJson(
    resolve(redmineRcRoot, "scripts/phase51/redmine-requirements-fingerprint-probe.mjs"),
    ["--root", redmineRcRoot],
    { cwd: redmineRcRoot, input: requirementsFixture },
  );
  const runnerFingerprint = runJson(
    resolve(runnerRcRoot, "scripts/phase51/agent-runner-requirements-fingerprint-probe.mjs"),
    ["--root", runnerRcRoot, "--input", "-"],
    { cwd: runnerRcRoot, input: requirementsFixture },
  );
  if (redmineFingerprint.requirementsFingerprint !== runnerFingerprint.fingerprint) {
    addDrift(
      drifts,
      "layerB.requirements-fingerprint-output",
      "implementation bug",
      "requirements-fingerprint",
      "Redmine canonical fingerprint and Agent Runner compatibility fingerprint differ for the same deterministic fixture",
    );
  }

  const handoffFixture = buildHandoffFixture(profile, redmineFingerprint.requirementsFingerprint);
  const producerRepresentation = runJson(
    resolve(redmineRcRoot, "scripts/phase51/redmine-durable-handoff-probe.mjs"),
    ["--root", redmineRcRoot],
    { cwd: redmineRcRoot, input: handoffFixture },
  );
  const expectedIdentity = expectedHandoffIdentity(handoffFixture);
  const expectedDurable = expectedDurableRepresentation(profile, handoffFixture);
  if (!isDeepStrictEqual(producerRepresentation.handoffIdentity, expectedIdentity)) {
    addDrift(
      drifts,
      "layerB.producer-handoff-identity",
      "implementation bug",
      REDMINE_REPOSITORY,
      "Actual Redmine producer handoff identity differs from the contract-derived expected identity",
    );
  }
  if (!isDeepStrictEqual(producerRepresentation.durableRepresentation, expectedDurable)) {
    addDrift(
      drifts,
      "layerB.producer-durable-representation",
      "implementation bug",
      REDMINE_REPOSITORY,
      "Actual Redmine durable representation differs from the contract-derived expected representation",
    );
  }

  const consumerValidation = runJson(
    resolve(runnerRcRoot, "scripts/phase51/agent-runner-handoff-validation-probe.mjs"),
    ["--root", runnerRcRoot, "--input", "-"],
    { cwd: runnerRcRoot, input: runnerProbeInput(profile, handoffFixture) },
  );
  if (!isDeepStrictEqual(consumerValidation.validationResult, expectedRunnerValidation(handoffFixture))) {
    addDrift(
      drifts,
      "layerB.consumer-validation",
      "implementation bug",
      RUNNER_REPOSITORY,
      "Agent Runner production handoff validation result differs from the contract-derived expected validated handoff",
    );
  }

  const phase50Baseline = runJson(
    resolve(runnerRcRoot, "scripts/phase51/agent-runner-phase50-baseline-probe.mjs"),
    ["--root", runnerRcRoot],
    { cwd: runnerRcRoot },
  );
  if (phase50Baseline.result !== "PASS") {
    addDrift(
      drifts,
      "layerC.phase50-golden-baseline",
      "implementation bug",
      RUNNER_REPOSITORY,
      "Agent Runner current RC does not conform to the Phase 50 machine-readable golden baseline",
    );
  }

  const current = {
    redmineMcp: {
      componentVersion: redmineIdentity.current.componentVersion,
      exactSourceRevision: redmineIdentity.current.exactSourceRevision,
      rcIdentityGeneration: redmineIdentity.generation,
      rcIdentityGenerationId: redmineIdentity.generationId,
      rcVerificationGeneration: redmineVerification.generation,
      rcVerificationGenerationId: redmineVerification.generationId,
      rcVerificationResult: redmineVerification.current.result,
    },
    agentRunner: {
      componentVersion: runnerIdentity.current.componentVersion,
      exactSourceRevision: runnerIdentity.current.exactSourceRevision,
      rcIdentityGeneration: runnerIdentity.generation,
      rcIdentityGenerationId: runnerIdentity.generationId,
      rcVerificationGeneration: runnerVerification.generation,
      rcVerificationGenerationId: runnerVerification.generationId,
      rcVerificationResult: runnerVerification.current.result,
      realInfrastructureDecisionGeneration: realInfrastructure.generation,
      realInfrastructureDecisionGenerationId: realInfrastructure.generationId,
      realInfrastructureDecisionResult: infrastructureResult,
    },
    contracts: expectedContracts,
    expectedHandoffProfile: {
      path: "docs/contracts/system-release-handoff-profile.json",
      schemaVersion: profile.schemaVersion,
      profileId: profile.profileId,
      contractReferences: structuredClone(profile.contractReferences),
    },
    layerA: {
      contractVsProducer: isDeepStrictEqual(profile, producerProfileResult.handoffSemanticProfile) ? "PASS" : "FAIL",
      contractVsConsumer: isDeepStrictEqual(profile, runnerSupport.handoffConsumerProfile) ? "PASS" : "FAIL",
      producerConstraintConformance: producerProfileResult.constraintConformance?.result ?? "FAIL",
      consumerConstraintConformance: runnerSupport.constraintConformance?.result ?? "FAIL",
      fingerprintImplementationBinding:
        isDeepStrictEqual(producerSources, consumerEvidenceSources) &&
        isDeepStrictEqual(producerSources, consumerProbeSources)
          ? "PASS"
          : "FAIL",
    },
    layerB: {
      contractDerivedFixture: {
        result: "PASS",
        issueId: handoffFixture.issueId,
        repository: handoffFixture.repository,
        requirementsFingerprint: handoffFixture.requirementsFingerprint,
      },
      producerRepresentation: {
        result:
          isDeepStrictEqual(producerRepresentation.handoffIdentity, expectedIdentity) &&
          isDeepStrictEqual(producerRepresentation.durableRepresentation, expectedDurable)
            ? "PASS"
            : "FAIL",
        productionBindings: producerRepresentation.productionBindings,
      },
      consumerValidation: {
        result: isDeepStrictEqual(
          consumerValidation.validationResult,
          expectedRunnerValidation(handoffFixture),
        ) ? "PASS" : "FAIL",
        productionBinding: runnerVerification.current.productionBindings.handoffValidationEntryPoint,
        capturedReference: consumerValidation.capturedReference,
      },
    },
    requirementsFingerprintCompatibilityResult:
      redmineFingerprint.requirementsFingerprint === runnerFingerprint.fingerprint ? "PASS" : "FAIL",
    phase50GoldenBaseline: {
      repository: RUNNER_REPOSITORY,
      sourceRevision: runnerIdentity.current.exactSourceRevision,
      path: "docs/contracts/phase50-contract-baseline.json",
      finalVerificationPath: "docs/verification/phase50-final-verification-20260921.json",
      executionLifecycles: phase50Baseline.result === "PASS" ? "PASS" : "FAIL",
      executionOutcomes: phase50Baseline.result === "PASS" ? "PASS" : "FAIL",
      artifact: phase50Baseline.result === "PASS" ? "PASS" : "FAIL",
      iam: phase50Baseline.result === "PASS" ? "PASS" : "FAIL",
      result: phase50Baseline.result,
    },
    detectedDrift: drifts,
    blockingIncompatibilityCount: drifts.length,
    unresolvedContractDriftCount: drifts.filter((drift) => drift.id.startsWith("contracts.") || drift.id.startsWith("profile.") || drift.id.startsWith("contract-blob.")).length,
    result: drifts.length === 0 ? "PASS" : "FAIL",
    verifiedAt,
  };

  return { current, evidenceSchema };
}

function runSelfTest(root) {
  const profile = readJson(resolve(root, "docs/contracts/system-release-handoff-profile.json"));
  const fingerprint = `sha256:${"b".repeat(64)}`;
  const fixture = buildHandoffFixture(profile, fingerprint);
  const same = compareProfiles(profile, structuredClone(profile), structuredClone(profile));
  if (same.length !== 0) fail("self-test: identical profiles reported drift");

  const producer = structuredClone(profile);
  const consumer = structuredClone(profile);
  producer.lifecycle.readyForAgentValue = "Ready for Agent Drift";
  consumer.lifecycle.readyForAgentValue = "Ready for Agent Drift";
  const sameDirectionDrift = compareProfiles(profile, producer, consumer);
  if (sameDirectionDrift.length !== 2) {
    fail("self-test: same-direction producer/consumer drift was not detected against canonical profile");
  }
  if (expectedHandoffIdentity(fixture).requirements_fingerprint !== fingerprint) {
    fail("self-test: contract-derived handoff identity mismatch");
  }
  if (expectedDurableRepresentation(profile, fixture).lifecycle !== "Ready for Agent") {
    fail("self-test: contract-derived durable representation mismatch");
  }
  if (expectedRunnerValidation(fixture).ok !== true) {
    fail("self-test: expected Runner validation fixture is not positive");
  }
  const registryBlob = "a".repeat(40);
  const fingerprintBlob = "b".repeat(40);
  if (declaredSourceBlobSha({ sourceBlobSha: registryBlob }) !== registryBlob) {
    fail("self-test: registry sourceBlobSha convention is not supported");
  }
  if (declaredSourceBlobSha({ blobSha: fingerprintBlob }) !== fingerprintBlob) {
    fail("self-test: fingerprint blobSha convention is not supported");
  }

  const id = canonicalGenerationId(RECORD_TYPE, 1, { result: "PASS" });
  if (!/^sha256:[0-9a-f]{64}$/u.test(id)) {
    fail("self-test: generationId is not canonical sha256 lowercase-hex");
  }
  return {
    result: "PASS",
    sameDirectionDriftDetected: true,
    contractDerivedFixture: "PASS",
    generationId: "PASS",
    sourceBlobConventions: "PASS",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(optionalString(options, "root") ?? process.cwd());
  if (options.get("self-test") === true) {
    process.stdout.write(`${JSON.stringify(runSelfTest(root), null, 2)}\n`);
    return;
  }
  const redmineRcRoot = requiredOption(options, "redmine-rc-root");
  const runnerRcRoot = requiredOption(options, "runner-rc-root");
  const verifiedAt = optionalString(options, "verified-at") ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(verifiedAt))) fail("--verified-at must be an RFC3339 timestamp");
  const outputPath = resolve(root, optionalString(options, "output") ?? DEFAULT_OUTPUT);

  const { current, evidenceSchema } = await verifyCrossComponentCompatibility({
    root,
    redmineRcRoot,
    runnerRcRoot,
    verifiedAt,
  });
  const record = initialOrReentryEnvelope(current, outputPath, options, evidenceSchema);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Phase 51-4 cross-component compatibility ${current.result}: ${outputPath}\n`,
  );
  if (current.result !== "PASS") process.exitCode = 1;
}

const invoked = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
