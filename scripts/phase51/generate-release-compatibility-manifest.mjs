#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RECORD_TYPE = "release-compatibility-manifest";
const PLATFORM_MILESTONE = "0.4.0";
const REDMINE_REPOSITORY = "mcp-mamono210/redmine";
const RUNNER_REPOSITORY = "mcp-mamono210/ai-agent-runner";
const OUTPUT_RELATIVE_PATH = "docs/verification/v0.4.0-release-compatibility-manifest.json";
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const INPUT_PATHS = Object.freeze({
  evidenceSchema: "docs/contracts/system-release-compatibility-evidence.schema.json",
  registry: "docs/contracts/system-release-compatibility-contract-registry.json",
  profile: "docs/contracts/system-release-handoff-profile.json",
  redmineIdentity: "docs/verification/phase51-redmine-mcp-rc-identity.json",
  redmineVerification: "docs/verification/phase51-redmine-mcp-rc-verification.json",
  runnerIdentity: "docs/verification/phase51-agent-runner-rc-identity.json",
  runnerVerification: "docs/verification/phase51-agent-runner-rc-verification.json",
  infrastructureDecision: "docs/verification/phase51-agent-runner-real-infrastructure-decision.json",
  compatibility: "docs/verification/phase51-cross-component-compatibility.json",
});

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function canonicalGenerationPayload(recordType, generation, current) {
  return JSON.stringify({ recordType, generation, current });
}

function generationId(recordType, generation, current) {
  return `sha256:${createHash("sha256")
    .update(canonicalGenerationPayload(recordType, generation, current))
    .digest("hex")}`;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertExactRevision(revision, label) {
  if (!SHA1.test(revision ?? "")) {
    fail(`${label} must be an exact 40-hex Git revision`);
  }
}

function assertRevisionExists(root, revision, label) {
  assertExactRevision(revision, label);
  try {
    git(root, ["cat-file", "-e", `${revision}^{commit}`]);
  } catch {
    fail(`${label} is not available in ${root}: ${revision}`);
  }
}

function assertExactCleanRunnerCheckout(root, expectedRevision) {
  const actual = git(root, ["rev-parse", "HEAD"]);
  if (actual !== expectedRevision) {
    fail(`Agent Runner checkout revision mismatch: expected ${expectedRevision}, got ${actual}`);
  }
  const status = git(root, ["status", "--porcelain"]);
  if (status !== "") {
    fail("Agent Runner exact RC checkout must be clean");
  }
}

function assertCanonicalInputsCommitted(root) {
  const paths = [
    INPUT_PATHS.evidenceSchema,
    INPUT_PATHS.registry,
    INPUT_PATHS.profile,
    INPUT_PATHS.redmineIdentity,
    INPUT_PATHS.redmineVerification,
    INPUT_PATHS.runnerIdentity,
    INPUT_PATHS.runnerVerification,
    INPUT_PATHS.infrastructureDecision,
    INPUT_PATHS.compatibility,
  ];
  for (const path of paths) {
    try {
      git(root, ["ls-files", "--error-unmatch", path]);
    } catch {
      fail(`canonical Phase 51 input is not tracked: ${path}`);
    }
    const unstaged = git(root, ["diff", "--", path]);
    const staged = git(root, ["diff", "--cached", "--", path]);
    if (unstaged !== "" || staged !== "") {
      fail(`canonical Phase 51 input has uncommitted changes: ${path}`);
    }
  }
}

function gitBlobShaAt(root, revision, path) {
  assertRevisionExists(root, revision, `sourceRevision for ${path}`);
  const sha = git(root, ["rev-parse", `${revision}:${path}`]);
  if (!SHA1.test(sha)) {
    fail(`Git did not return a blob SHA for ${path} at ${revision}`);
  }
  return sha;
}

function projectContractIdentity(entry) {
  return {
    contractId: entry.contractId,
    semanticRevision: entry.semanticRevision,
    sourceRevision: entry.sourceRevision,
    sourceBlobSha: entry.sourceBlobSha,
  };
}

function sortedByContractId(entries) {
  return [...entries].sort((left, right) => left.contractId.localeCompare(right.contractId));
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch`);
  }
}

function validateGenerationIdentity(record, expectedType) {
  if (record.recordType !== expectedType) {
    fail(`expected recordType ${expectedType}, got ${record.recordType}`);
  }
  if (!Number.isInteger(record.generation) || record.generation < 1) {
    fail(`${expectedType} generation must be a positive integer`);
  }
  const expectedId = generationId(record.recordType, record.generation, record.current);
  if (record.generationId !== expectedId) {
    fail(`${expectedType} generationId mismatch`);
  }
  if (!SHA256_ID.test(record.generationId)) {
    fail(`${expectedType} generationId format is invalid`);
  }
  validateHistoryLineage(record);
}

function validateHistoryLineage(record) {
  if (!Array.isArray(record.history)) fail(`${record.recordType} history must be an array`);
  if (record.history.length !== record.generation - 1) {
    fail(`${record.recordType} history length does not match generation`);
  }
  for (const [index, entry] of record.history.entries()) {
    const expectedGeneration = index + 1;
    if (entry.generation !== expectedGeneration) {
      fail(`${record.recordType} history generation sequence is not contiguous`);
    }
    const expectedId = generationId(record.recordType, entry.generation, entry.snapshot);
    if (entry.generationId !== expectedId) {
      fail(`${record.recordType} history generationId mismatch at generation ${entry.generation}`);
    }
    if (!RFC3339.test(entry.invalidatedAt ?? "")) {
      fail(`${record.recordType} history invalidatedAt is not RFC3339`);
    }
    if (typeof entry.invalidationReason !== "string" || entry.invalidationReason.trim() === "") {
      fail(`${record.recordType} history invalidationReason is required`);
    }
    if (
      entry.invalidationReason.startsWith("blocking-defect:") &&
      !Number.isInteger(entry.invalidatingDefectIssueId)
    ) {
      fail(`${record.recordType} blocking-defect history requires invalidatingDefectIssueId`);
    }
  }

  if (record.generation === 1) {
    if (record.supersedes !== null) fail(`${record.recordType} generation 1 must not supersede another generation`);
  } else {
    const previous = record.history.at(-1);
    if (record.supersedes !== previous.generationId) {
      fail(`${record.recordType} supersedes must reference the previous generationId`);
    }
  }
}

async function validateAgainstCommonSchema(root, record) {
  const schema = readJson(resolve(root, INPUT_PATHS.evidenceSchema));
  const validatorUrl = pathToFileURL(
    resolve(root, "scripts/phase51/validate-system-release-compatibility.mjs"),
  ).href;
  const { validateSchema } = await import(validatorUrl);
  validateSchema(record, schema);
}

function assertEvidenceCombination(inputs) {
  const {
    registry,
    profile,
    redmineIdentity,
    redmineVerification,
    runnerIdentity,
    runnerVerification,
    infrastructureDecision,
    compatibility,
  } = inputs;

  if (redmineVerification.current.result !== "PASS") {
    fail("Redmine MCP RC verification is not PASS");
  }
  if (runnerVerification.current.result !== "PASS") {
    fail("Agent Runner RC verification is not PASS");
  }
  if (compatibility.current.result !== "PASS") {
    fail("latest cross-component compatibility is not PASS");
  }
  if (compatibility.current.blockingIncompatibilityCount !== 0) {
    fail("cross-component compatibility contains blocking incompatibilities");
  }
  if (compatibility.current.unresolvedContractDriftCount !== 0) {
    fail("cross-component compatibility contains unresolved contract drift");
  }
  if ((compatibility.current.detectedDrift ?? []).length !== 0) {
    fail("cross-component compatibility contains detected drift");
  }

  const infrastructureResult = infrastructureDecision.current.changeTriggeredRealS3?.result;
  if (!["PASS", "NOT_REQUIRED_WITH_REASON"].includes(infrastructureResult)) {
    fail(`Agent Runner real-infrastructure decision is not releasable: ${String(infrastructureResult)}`);
  }

  const redmineRevision = redmineIdentity.current.exactSourceRevision;
  const runnerRevision = runnerIdentity.current.exactSourceRevision;
  assertExactRevision(redmineRevision, "Redmine MCP exactSourceRevision");
  assertExactRevision(runnerRevision, "Agent Runner exactSourceRevision");

  if (redmineVerification.current.exactSourceRevision !== redmineRevision) {
    fail("Redmine MCP RC identity / verification revision mismatch");
  }
  if (runnerVerification.current.exactSourceRevision !== runnerRevision) {
    fail("Agent Runner RC identity / verification revision mismatch");
  }
  if (infrastructureDecision.current.exactSourceRevision !== runnerRevision) {
    fail("Agent Runner RC identity / real-infrastructure revision mismatch");
  }

  const redCross = compatibility.current.redmineMcp;
  const runCross = compatibility.current.agentRunner;
  if (
    redCross.componentVersion !== redmineIdentity.current.componentVersion ||
    redCross.exactSourceRevision !== redmineRevision ||
    redCross.rcIdentityGeneration !== redmineIdentity.generation ||
    redCross.rcIdentityGenerationId !== redmineIdentity.generationId ||
    redCross.rcVerificationGeneration !== redmineVerification.generation ||
    redCross.rcVerificationGenerationId !== redmineVerification.generationId ||
    redCross.rcVerificationResult !== redmineVerification.current.result
  ) {
    fail("cross-component compatibility Redmine MCP evidence combination is stale");
  }
  if (
    runCross.componentVersion !== runnerIdentity.current.componentVersion ||
    runCross.exactSourceRevision !== runnerRevision ||
    runCross.rcIdentityGeneration !== runnerIdentity.generation ||
    runCross.rcIdentityGenerationId !== runnerIdentity.generationId ||
    runCross.rcVerificationGeneration !== runnerVerification.generation ||
    runCross.rcVerificationGenerationId !== runnerVerification.generationId ||
    runCross.rcVerificationResult !== runnerVerification.current.result ||
    runCross.realInfrastructureDecisionGeneration !== infrastructureDecision.generation ||
    runCross.realInfrastructureDecisionGenerationId !== infrastructureDecision.generationId ||
    runCross.realInfrastructureDecisionResult !== infrastructureResult
  ) {
    fail("cross-component compatibility Agent Runner evidence combination is stale");
  }

  const registryContracts = sortedByContractId(registry.contracts).map(projectContractIdentity);
  const crossContracts = sortedByContractId(compatibility.current.contracts).map(projectContractIdentity);
  assertJsonEqual(crossContracts, registryContracts, "compatibility / registry contract identities");

  const registryById = new Map(registry.contracts.map((entry) => [entry.contractId, entry]));
  for (const reference of profile.contractReferences) {
    const entry = registryById.get(reference.contractId);
    if (!entry || entry.semanticRevision !== reference.semanticRevision) {
      fail(`expected handoff profile references stale contract revision: ${reference.contractId}`);
    }
  }

  const expectedProfile = compatibility.current.expectedHandoffProfile;
  if (
    expectedProfile.path !== INPUT_PATHS.profile ||
    expectedProfile.schemaVersion !== profile.schemaVersion ||
    expectedProfile.profileId !== profile.profileId
  ) {
    fail("cross-component compatibility expected handoff profile identity is stale");
  }
  assertJsonEqual(
    expectedProfile.contractReferences,
    profile.contractReferences,
    "compatibility / canonical profile contract references",
  );

  return { redmineRevision, runnerRevision, infrastructureResult };
}

function assertContractBlobs({ root, runnerRoot, registry }) {
  for (const entry of registry.contracts) {
    if (entry.registrationState !== "committed") {
      fail(`manifest creation rejects non-committed contract registration: ${entry.contractId}`);
    }
    const sourceRoot = entry.repository === REDMINE_REPOSITORY
      ? root
      : entry.repository === RUNNER_REPOSITORY
        ? runnerRoot
        : null;
    if (sourceRoot === null) fail(`unsupported contract repository: ${entry.repository}`);
    const actualBlob = gitBlobShaAt(sourceRoot, entry.sourceRevision, entry.path);
    if (actualBlob !== entry.sourceBlobSha) {
      fail(`contract blob mismatch for ${entry.contractId}: expected ${entry.sourceBlobSha}, got ${actualBlob}`);
    }
  }
}

function loadInputs(root) {
  return {
    registry: readJson(resolve(root, INPUT_PATHS.registry)),
    profile: readJson(resolve(root, INPUT_PATHS.profile)),
    redmineIdentity: readJson(resolve(root, INPUT_PATHS.redmineIdentity)),
    redmineVerification: readJson(resolve(root, INPUT_PATHS.redmineVerification)),
    runnerIdentity: readJson(resolve(root, INPUT_PATHS.runnerIdentity)),
    runnerVerification: readJson(resolve(root, INPUT_PATHS.runnerVerification)),
    infrastructureDecision: readJson(resolve(root, INPUT_PATHS.infrastructureDecision)),
    compatibility: readJson(resolve(root, INPUT_PATHS.compatibility)),
  };
}

async function validateInputEvidence(root, inputs) {
  const records = [
    [inputs.redmineIdentity, "redmine-mcp-rc-identity"],
    [inputs.redmineVerification, "redmine-mcp-rc-verification"],
    [inputs.runnerIdentity, "agent-runner-rc-identity"],
    [inputs.runnerVerification, "agent-runner-rc-verification"],
    [inputs.infrastructureDecision, "agent-runner-real-infrastructure-decision"],
    [inputs.compatibility, "cross-component-compatibility"],
  ];
  for (const [record, type] of records) {
    await validateAgainstCommonSchema(root, record);
    validateGenerationIdentity(record, type);
  }
}

function readPhase50FinalVerification(runnerRoot, compatibility, runnerRevision) {
  assertExactCleanRunnerCheckout(runnerRoot, runnerRevision);
  const relativePath = compatibility.current.phase50GoldenBaseline?.finalVerificationPath;
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    fail("cross-component compatibility does not reference Phase 50 final verification");
  }
  const path = resolve(runnerRoot, relativePath);
  const record = readJson(path);
  if (record.result !== "PASS") fail("Phase 50 final verification is not PASS");
  if (compatibility.current.phase50GoldenBaseline.result !== "PASS") {
    fail("Phase 50 golden baseline compatibility is not PASS");
  }
  return { relativePath, record };
}

function assertNoCompetingManifest(runnerRoot) {
  if (existsSync(resolve(runnerRoot, OUTPUT_RELATIVE_PATH))) {
    fail("Agent Runner contains a competing canonical release compatibility manifest");
  }
}

function buildCurrent({ inputs, phase50, verifiedAt }) {
  const {
    redmineIdentity,
    redmineVerification,
    runnerIdentity,
    runnerVerification,
    infrastructureDecision,
    compatibility,
  } = inputs;
  const infrastructureResult = infrastructureDecision.current.changeTriggeredRealS3.result;

  return {
    platformMilestone: PLATFORM_MILESTONE,
    redmineMcp: {
      componentVersion: redmineIdentity.current.componentVersion,
      exactSourceRevision: redmineIdentity.current.exactSourceRevision,
      rcIdentityEvidence: {
        path: INPUT_PATHS.redmineIdentity,
        generation: redmineIdentity.generation,
        generationId: redmineIdentity.generationId,
      },
    },
    agentRunner: {
      componentVersion: runnerIdentity.current.componentVersion,
      exactSourceRevision: runnerIdentity.current.exactSourceRevision,
      rcIdentityEvidence: {
        path: INPUT_PATHS.runnerIdentity,
        generation: runnerIdentity.generation,
        generationId: runnerIdentity.generationId,
      },
    },
    contracts: sortedByContractId(compatibility.current.contracts).map(projectContractIdentity),
    expectedHandoffProfile: structuredClone(compatibility.current.expectedHandoffProfile),
    verification: {
      phase50FinalVerification: {
        repository: RUNNER_REPOSITORY,
        sourceRevision: runnerIdentity.current.exactSourceRevision,
        path: phase50.relativePath,
        testedGitRevision: phase50.record.testedGitRevision,
        evidenceCommitRevision: phase50.record.evidenceCommitRevision,
        result: phase50.record.result,
      },
      redmineMcpRcVerification: {
        path: INPUT_PATHS.redmineVerification,
        generation: redmineVerification.generation,
        generationId: redmineVerification.generationId,
        result: redmineVerification.current.result,
      },
      agentRunnerRcVerification: {
        path: INPUT_PATHS.runnerVerification,
        generation: runnerVerification.generation,
        generationId: runnerVerification.generationId,
        result: runnerVerification.current.result,
      },
      agentRunnerRealInfrastructureDecision: {
        path: INPUT_PATHS.infrastructureDecision,
        generation: infrastructureDecision.generation,
        generationId: infrastructureDecision.generationId,
        result: infrastructureResult,
      },
      crossComponentCompatibility: {
        path: INPUT_PATHS.compatibility,
        generation: compatibility.generation,
        generationId: compatibility.generationId,
        result: compatibility.current.result,
      },
    },
    remainingReleaseOnlyChecks: [
      {
        checkId: "real-private-s3-system-release-gate",
        policy: phase50.record.realInfrastructurePolicy.realS3.policy,
        command: phase50.record.realInfrastructurePolicy.realS3.releaseGateCommand,
        evidenceLocation: phase50.record.realInfrastructurePolicy.record,
        blockingBehavior: "blocks Phase 52 system release until PASS",
      },
      {
        checkId: "sandbox-environment-conformance-system-release-gate",
        policy: phase50.record.realInfrastructurePolicy.sandbox.policy,
        command: phase50.record.realInfrastructurePolicy.sandbox.releaseGateCommand,
        evidenceLocation: phase50.record.realInfrastructurePolicy.record,
        blockingBehavior: "blocks Phase 52 system release until PASS",
      },
    ],
    knownLimitations: structuredClone(phase50.record.knownLimitations ?? []),
    outOfScopeBoundary: structuredClone(phase50.record.outOfScope ?? []),
    result: "PASS",
    generatedAt: verifiedAt,
  };
}

function assertManifestSemantics(manifest) {
  if (manifest.recordType !== RECORD_TYPE) fail("manifest recordType mismatch");
  if (manifest.current.platformMilestone !== PLATFORM_MILESTONE) fail("manifest platform milestone mismatch");
  for (const [label, component] of [
    ["Redmine MCP", manifest.current.redmineMcp],
    ["Agent Runner", manifest.current.agentRunner],
  ]) {
    assertExactRevision(component.exactSourceRevision, `${label} manifest exactSourceRevision`);
    if (Object.hasOwn(component, "rcVerificationEvidence") || Object.hasOwn(component, "verification")) {
      fail(`${label} component block duplicates verification SoT`);
    }
    if (!component.rcIdentityEvidence) fail(`${label} component block is missing RC identity evidence`);
  }
  const verification = manifest.current.verification;
  for (const key of [
    "redmineMcpRcVerification",
    "agentRunnerRcVerification",
    "agentRunnerRealInfrastructureDecision",
    "crossComponentCompatibility",
  ]) {
    if (!verification[key]) fail(`manifest verification block is missing ${key}`);
  }
  if (manifest.current.result !== "PASS") fail("manifest result is not PASS");
  if (!RFC3339.test(manifest.current.generatedAt ?? "")) fail("manifest generatedAt is not RFC3339");
}

function newEnvelope(current) {
  const generation = 1;
  return {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    generation,
    generationId: generationId(RECORD_TYPE, generation, current),
    current,
    history: [],
    supersedes: null,
  };
}

function reentryEnvelope(existing, current, { invalidatedAt, invalidationReason, invalidatingDefectIssueId }) {
  validateGenerationIdentity(existing, RECORD_TYPE);
  if (typeof invalidationReason !== "string" || invalidationReason.trim() === "") {
    fail("--replace-existing requires --invalidation-reason");
  }
  if (invalidationReason.startsWith("blocking-defect:") && !Number.isInteger(invalidatingDefectIssueId)) {
    fail("blocking-defect manifest re-entry requires --invalidating-defect-issue-id");
  }
  const historyEntry = {
    generation: existing.generation,
    generationId: existing.generationId,
    snapshot: existing.current,
    invalidatedAt,
    invalidationReason,
    invalidatingDefectIssueId: invalidatingDefectIssueId ?? null,
  };
  const generation = existing.generation + 1;
  return {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    generation,
    generationId: generationId(RECORD_TYPE, generation, current),
    current,
    history: [...existing.history, historyEntry],
    supersedes: existing.generationId,
  };
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    verifiedAt: new Date().toISOString(),
    replaceExisting: false,
    invalidationReason: null,
    invalidatingDefectIssueId: null,
    validateOnly: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--verified-at") options.verifiedAt = argv[++index];
    else if (arg === "--replace-existing") options.replaceExisting = true;
    else if (arg === "--invalidation-reason") options.invalidationReason = argv[++index];
    else if (arg === "--invalidating-defect-issue-id") options.invalidatingDefectIssueId = Number(argv[++index]);
    else if (arg === "--validate-only") options.validateOnly = true;
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  if (!RFC3339.test(options.verifiedAt)) fail("--verified-at must be RFC3339");
  return options;
}

function runSelfTest() {
  const firstCurrent = {
    platformMilestone: PLATFORM_MILESTONE,
    redmineMcp: { exactSourceRevision: "a".repeat(40), rcIdentityEvidence: {} },
    agentRunner: { exactSourceRevision: "b".repeat(40), rcIdentityEvidence: {} },
    verification: {
      redmineMcpRcVerification: {},
      agentRunnerRcVerification: {},
      agentRunnerRealInfrastructureDecision: {},
      crossComponentCompatibility: {},
    },
    result: "PASS",
    generatedAt: "2026-09-23T00:00:00Z",
  };
  const first = newEnvelope(firstCurrent);
  validateGenerationIdentity(first, RECORD_TYPE);

  const secondCurrent = structuredClone(firstCurrent);
  secondCurrent.generatedAt = "2026-09-23T01:00:00Z";
  const second = reentryEnvelope(first, secondCurrent, {
    invalidatedAt: "2026-09-23T01:00:00Z",
    invalidationReason: "compatibility generation changed",
    invalidatingDefectIssueId: null,
  });
  validateGenerationIdentity(second, RECORD_TYPE);

  let duplicateGuard = false;
  try {
    const invalid = structuredClone(first);
    invalid.current.redmineMcp.verification = {};
    assertManifestSemantics(invalid);
  } catch {
    duplicateGuard = true;
  }
  if (!duplicateGuard) fail("self-test duplicate verification SoT guard failed");

  let blockingDefectGuard = false;
  try {
    reentryEnvelope(first, secondCurrent, {
      invalidatedAt: "2026-09-23T01:00:00Z",
      invalidationReason: "blocking-defect: stale RC combination",
      invalidatingDefectIssueId: null,
    });
  } catch {
    blockingDefectGuard = true;
  }
  if (!blockingDefectGuard) fail("self-test blocking-defect lineage guard failed");

  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    generationId: "PASS",
    reentryHistory: "PASS",
    duplicateVerificationSoTGuard: "PASS",
    blockingDefectLineageGuard: "PASS",
  }, null, 2)}\n`);
}

async function prepareExpected({ root, runnerRoot, verifiedAt }) {
  assertCanonicalInputsCommitted(root);
  const inputs = loadInputs(root);
  await validateInputEvidence(root, inputs);
  const { redmineRevision, runnerRevision } = assertEvidenceCombination(inputs);
  assertRevisionExists(root, redmineRevision, "Redmine MCP exact RC revision");
  assertContractBlobs({ root, runnerRoot, registry: inputs.registry });
  const phase50 = readPhase50FinalVerification(runnerRoot, inputs.compatibility, runnerRevision);
  assertNoCompetingManifest(runnerRoot);
  return { inputs, phase50, current: buildCurrent({ inputs, phase50, verifiedAt }) };
}

async function validateManifest({ root, runnerRoot, manifest }) {
  await validateAgainstCommonSchema(root, manifest);
  validateGenerationIdentity(manifest, RECORD_TYPE);
  assertManifestSemantics(manifest);
  const prepared = await prepareExpected({
    root,
    runnerRoot,
    verifiedAt: manifest.current.generatedAt,
  });
  assertJsonEqual(manifest.current, prepared.current, "manifest current / canonical inputs");
  return manifest;
}

async function main(options) {
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  if (options.runnerRoot === null) fail("--runner-root is required");

  const outputPath = resolve(options.root, OUTPUT_RELATIVE_PATH);
  if (options.validateOnly) {
    if (!existsSync(outputPath)) fail(`${OUTPUT_RELATIVE_PATH} does not exist`);
    const manifest = readJson(outputPath);
    await validateManifest({ root: options.root, runnerRoot: options.runnerRoot, manifest });
    process.stdout.write(`Phase 51-5 release compatibility manifest validation PASS: ${outputPath}\n`);
    return;
  }

  const prepared = await prepareExpected({
    root: options.root,
    runnerRoot: options.runnerRoot,
    verifiedAt: options.verifiedAt,
  });

  let manifest;
  if (existsSync(outputPath)) {
    if (!options.replaceExisting) {
      fail(`${outputPath} already exists; use --replace-existing with an invalidation reason for re-entry`);
    }
    const existing = readJson(outputPath);
    await validateAgainstCommonSchema(options.root, existing);
    manifest = reentryEnvelope(existing, prepared.current, {
      invalidatedAt: options.verifiedAt,
      invalidationReason: options.invalidationReason,
      invalidatingDefectIssueId: options.invalidatingDefectIssueId,
    });
  } else {
    if (options.replaceExisting) fail("--replace-existing was provided but no existing manifest exists");
    manifest = newEnvelope(prepared.current);
  }

  await validateAgainstCommonSchema(options.root, manifest);
  validateGenerationIdentity(manifest, RECORD_TYPE);
  assertManifestSemantics(manifest);
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await validateManifest({ root: options.root, runnerRoot: options.runnerRoot, manifest });
  process.stdout.write(`Phase 51-5 release compatibility manifest PASS: ${outputPath}\n`);
}

const options = parseArgs(process.argv.slice(2));
main(options).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
