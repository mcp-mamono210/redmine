#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RECORD_TYPE = "phase51-final-verification";
const FINAL_EVIDENCE_PATH = "docs/verification/phase51-final-verification.json";
const HANDOFF_PATH = "docs/verification/phase51-phase52-handoff.md";
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

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
  manifest: "docs/verification/v0.4.0-release-compatibility-manifest.json",
  phase50Final: "docs/verification/phase50-final-verification-20260921.json",
  phase50Policy: "docs/verification/phase50-real-infrastructure-policy.json",
});

const PHASE51_REQUIRED_CHILDREN = Object.freeze([5434, 5435, 5436, 5437, 5438]);
const PHASE51_PARENT = 5433;
const PHASE51_FINAL_ISSUE = 5439;
const PHASE51_KNOWN_FOLLOWUP = 5440;
const ROADMAP_TITLES = Object.freeze(["100_ロードマップ", "030_ロードマップ", "040_ロードマップ"]);

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

function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], {
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function gitShowBytes(root, revision, path) {
  return git(root, ["show", `${revision}:${path}`], null);
}

function gitRevisionIsAncestor(root, revision) {
  try {
    git(root, ["merge-base", "--is-ancestor", revision, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function assertExactCleanRunnerCheckout(runnerRoot, exactRevision) {
  const head = git(runnerRoot, ["rev-parse", "HEAD"]).trim();
  if (head !== exactRevision) {
    fail(`Agent Runner checkout revision mismatch: expected ${exactRevision}, got ${head}`);
  }
  const status = git(runnerRoot, ["status", "--porcelain"]).trim();
  if (status !== "") fail("Agent Runner exact RC checkout must be clean");
}

function projectContractIdentity(entry) {
  return {
    contractId: entry.contractId,
    semanticRevision: entry.semanticRevision,
    sourceRevision: entry.sourceRevision,
    sourceBlobSha: entry.sourceBlobSha,
  };
}

function sortedContracts(entries) {
  return [...entries].sort((a, b) => a.contractId.localeCompare(b.contractId));
}

function stableEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRecordEnvelope(record, expectedType) {
  if (record.recordType !== expectedType) fail(`expected recordType ${expectedType}`);
  if (!Number.isInteger(record.generation) || record.generation < 1) fail(`${expectedType} generation is invalid`);
  if (!SHA256_ID.test(record.generationId ?? "")) fail(`${expectedType} generationId format is invalid`);
  const expected = generationId(record.recordType, record.generation, record.current);
  if (record.generationId !== expected) fail(`${expectedType} generationId mismatch`);
  if (!Array.isArray(record.history)) fail(`${expectedType} history must be an array`);
  if (record.generation === 1 && record.supersedes !== null) fail(`${expectedType} generation 1 must not supersede another generation`);
  if (record.generation > 1) {
    const previous = record.history.at(-1);
    if (!previous || record.supersedes !== previous.generationId) fail(`${expectedType} supersedes lineage mismatch`);
  }
  for (let i = 0; i < record.history.length; i += 1) {
    const entry = record.history[i];
    const expectedGeneration = i + 1;
    if (entry.generation !== expectedGeneration) fail(`${expectedType} history generation sequence mismatch`);
    if (entry.generationId !== generationId(record.recordType, entry.generation, entry.snapshot)) {
      fail(`${expectedType} history generationId mismatch`);
    }
    if (!RFC3339.test(entry.invalidatedAt ?? "")) fail(`${expectedType} history invalidatedAt is invalid`);
    if (typeof entry.invalidationReason !== "string" || entry.invalidationReason.trim() === "") {
      fail(`${expectedType} history invalidationReason is required`);
    }
    if (entry.invalidationReason.startsWith("blocking-defect:") && !Number.isInteger(entry.invalidatingDefectIssueId)) {
      fail(`${expectedType} blocking-defect history requires invalidatingDefectIssueId`);
    }
  }
}

async function loadCommonSchemaValidator(root) {
  const moduleUrl = pathToFileURL(resolve(root, "scripts/phase51/validate-system-release-compatibility.mjs")).href;
  const module = await import(moduleUrl);
  if (typeof module.validateSchema !== "function") fail("Phase 51 common schema validator export is missing");
  return module.validateSchema;
}

function runStrictRegistryValidation(root) {
  execFileSync(process.execPath, [
    resolve(root, "scripts/phase51/validate-system-release-compatibility.mjs"),
    "--root", root,
    "--mode", "strict",
    "--negative-controls",
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

function runManifestValidation(root, runnerRoot) {
  execFileSync(process.execPath, [
    resolve(root, "scripts/phase51/generate-release-compatibility-manifest.mjs"),
    "--root", root,
    "--runner-root", runnerRoot,
    "--validate-only",
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

async function validateEvidenceSchema(root, records) {
  const schema = readJson(resolve(root, INPUT_PATHS.evidenceSchema));
  const validateSchema = await loadCommonSchemaValidator(root);
  for (const record of records) validateSchema(record, schema);
}

function repositoryRoot(repository, root, runnerRoot) {
  if (repository === "mcp-mamono210/redmine") return root;
  if (repository === "mcp-mamono210/ai-agent-runner") return runnerRoot;
  fail(`unsupported repository in Phase 51 Final Gate: ${repository}`);
}

function verifyContractBlobs({ root, runnerRoot, registry, redmineRcRevision, runnerRcRevision }) {
  for (const entry of registry.contracts) {
    if (entry.registrationState !== "committed") fail(`contract ${entry.contractId} is not committed`);
    if (!SHA1.test(entry.sourceRevision ?? "")) fail(`contract ${entry.contractId} sourceRevision is invalid`);
    if (!SHA1.test(entry.sourceBlobSha ?? "")) fail(`contract ${entry.contractId} sourceBlobSha is invalid`);
    const repoRoot = repositoryRoot(entry.repository, root, runnerRoot);
    if (!gitRevisionIsAncestor(repoRoot, entry.sourceRevision)) {
      fail(`contract sourceRevision is not in current repository history: ${entry.contractId}`);
    }
    const sourceBytes = gitShowBytes(repoRoot, entry.sourceRevision, entry.path);
    if (gitBlobSha(sourceBytes) !== entry.sourceBlobSha) fail(`contract source blob mismatch: ${entry.contractId}`);

    const applicableRc = entry.repository === "mcp-mamono210/redmine" ? redmineRcRevision : runnerRcRevision;
    const rcBytes = gitShowBytes(repoRoot, applicableRc, entry.path);
    if (gitBlobSha(rcBytes) !== entry.sourceBlobSha) {
      fail(`contract is not present with the registered blob in applicable RC: ${entry.contractId}`);
    }
  }
}

function verifyFingerprintSourceBlobs({ root, redmineVerification, runnerVerification }) {
  const producer = redmineVerification.current.requirementsFingerprintImplementationSources;
  const consumer = runnerVerification.current.requirementsFingerprintExpectedImplementationSources;
  if (!Array.isArray(producer) || !Array.isArray(consumer) || !stableEqual(producer, consumer)) {
    fail("producer / consumer requirements fingerprint source identities differ");
  }
  for (const source of producer) {
    if (source.repository !== "mcp-mamono210/redmine") fail("requirements fingerprint canonical source repository is invalid");
    const bytes = gitShowBytes(root, source.sourceRevision, source.path);
    if (gitBlobSha(bytes) !== source.blobSha) fail(`requirements fingerprint source blob mismatch: ${source.path}`);
  }
}

function verifyRunnerFingerprintBinding({ runnerRoot, runnerVerification }) {
  const binding = runnerVerification.current.productionBindings?.requirementsFingerprintEntryPoint;
  if (!binding) fail("Agent Runner requirements fingerprint production binding is missing");
  const bytes = gitShowBytes(runnerRoot, binding.sourceRevision, binding.module);
  if (gitBlobSha(bytes) !== binding.blobSha) fail("Agent Runner requirements fingerprint binding blob mismatch");
}

function verifyProfileAgainstRegistry(profile, registry) {
  const byId = new Map(registry.contracts.map((entry) => [entry.contractId, entry]));
  for (const ref of profile.contractReferences) {
    const entry = byId.get(ref.contractId);
    if (!entry) fail(`handoff profile references missing contract: ${ref.contractId}`);
    if (entry.semanticRevision !== ref.semanticRevision) fail(`handoff profile semantic revision is stale: ${ref.contractId}`);
  }
}

function verifyRevisionClosure({ registry, manifest, compatibility, redmineIdentity, redmineVerification, runnerIdentity, runnerVerification, infrastructureDecision }) {
  if (redmineIdentity.current.exactSourceRevision !== redmineVerification.current.exactSourceRevision) fail("Redmine RC identity / verification revision mismatch");
  if (runnerIdentity.current.exactSourceRevision !== runnerVerification.current.exactSourceRevision) fail("Agent Runner RC identity / verification revision mismatch");
  if (infrastructureDecision.current.exactSourceRevision !== runnerIdentity.current.exactSourceRevision) fail("Agent Runner infrastructure decision revision mismatch");

  const redRevision = redmineIdentity.current.exactSourceRevision;
  const runnerRevision = runnerIdentity.current.exactSourceRevision;
  if (compatibility.current.redmineMcp.exactSourceRevision !== redRevision || manifest.current.redmineMcp.exactSourceRevision !== redRevision) {
    fail("Redmine RC revision closure mismatch");
  }
  if (compatibility.current.agentRunner.exactSourceRevision !== runnerRevision || manifest.current.agentRunner.exactSourceRevision !== runnerRevision) {
    fail("Agent Runner RC revision closure mismatch");
  }

  const redIdentityRef = manifest.current.redmineMcp.rcIdentityEvidence;
  const runnerIdentityRef = manifest.current.agentRunner.rcIdentityEvidence;
  if (redIdentityRef.generation !== redmineIdentity.generation || redIdentityRef.generationId !== redmineIdentity.generationId) fail("Redmine RC identity generation closure mismatch");
  if (runnerIdentityRef.generation !== runnerIdentity.generation || runnerIdentityRef.generationId !== runnerIdentity.generationId) fail("Agent Runner RC identity generation closure mismatch");

  const v = manifest.current.verification;
  if (v.redmineMcpRcVerification.generation !== redmineVerification.generation || v.redmineMcpRcVerification.generationId !== redmineVerification.generationId || v.redmineMcpRcVerification.result !== "PASS") fail("Redmine RC verification manifest reference is stale or non-PASS");
  if (v.agentRunnerRcVerification.generation !== runnerVerification.generation || v.agentRunnerRcVerification.generationId !== runnerVerification.generationId || v.agentRunnerRcVerification.result !== "PASS") fail("Agent Runner RC verification manifest reference is stale or non-PASS");
  const infraResult = infrastructureDecision.current.changeTriggeredRealS3?.result;
  if (!new Set(["PASS", "NOT_REQUIRED_WITH_REASON"]).has(infraResult)) fail("Agent Runner real infrastructure decision is not releasable");
  if (v.agentRunnerRealInfrastructureDecision.generation !== infrastructureDecision.generation || v.agentRunnerRealInfrastructureDecision.generationId !== infrastructureDecision.generationId || v.agentRunnerRealInfrastructureDecision.result !== infraResult) fail("Agent Runner infrastructure manifest reference is stale");
  if (v.crossComponentCompatibility.generation !== compatibility.generation || v.crossComponentCompatibility.generationId !== compatibility.generationId || v.crossComponentCompatibility.result !== "PASS") fail("cross-component compatibility manifest reference is stale or non-PASS");

  const registryContracts = sortedContracts(registry.contracts).map(projectContractIdentity);
  const compatibilityContracts = sortedContracts(compatibility.current.contracts).map(projectContractIdentity);
  const manifestContracts = sortedContracts(manifest.current.contracts).map(projectContractIdentity);
  if (!stableEqual(registryContracts, compatibilityContracts) || !stableEqual(registryContracts, manifestContracts)) {
    fail("contract identity closure mismatch between registry / compatibility / manifest");
  }

  if (compatibility.current.result !== "PASS") fail("latest cross-component compatibility is not PASS");
  if (compatibility.current.blockingIncompatibilityCount !== 0) fail("blocking incompatibility remains");
  if (compatibility.current.unresolvedContractDriftCount !== 0) fail("unresolved contract drift remains");
  if (compatibility.current.layerA?.contractVsProducer !== "PASS" || compatibility.current.layerA?.contractVsConsumer !== "PASS") fail("Layer A contract comparison is not PASS");
  if (compatibility.current.layerA?.producerConstraintConformance !== "PASS" || compatibility.current.layerA?.consumerConstraintConformance !== "PASS") fail("Layer A constraint conformance is not PASS");
  if (compatibility.current.layerA?.fingerprintImplementationBinding !== "PASS") fail("fingerprint source binding is not PASS");
  if (compatibility.current.layerB?.contractDerivedFixture?.result !== "PASS" || compatibility.current.layerB?.producerRepresentation?.result !== "PASS" || compatibility.current.layerB?.consumerValidation?.result !== "PASS") fail("Layer B contract-derived handoff verification is not PASS");
  if (compatibility.current.requirementsFingerprintCompatibilityResult !== "PASS") fail("requirements fingerprint compatibility is not PASS");
  if (compatibility.current.phase50GoldenBaseline?.result !== "PASS") fail("Phase 50 golden baseline is not PASS");
}

function requiredText(text, fragments, label) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(`${label} missing required alignment fragment: ${fragment}`);
  }
}

function validateDocumentationAlignment({ root, runnerRoot, roadmaps }) {
  const redmineReadme = readFileSync(resolve(root, "README.md"), "utf8");
  const redmineChangelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const runnerReadme = readFileSync(resolve(runnerRoot, "README.md"), "utf8");
  const runnerChangelog = readFileSync(resolve(runnerRoot, "CHANGELOG.md"), "utf8");

  requiredText(redmineReadme, ["v0.3.0", "Ready for Agent", "future Agent execution layer"], "Redmine MCP README");
  requiredText(redmineChangelog, ["## [0.3.0]", "Ready for Agent"], "Redmine MCP CHANGELOG");
  requiredText(runnerReadme, ["v0.4.0 system milestone", "Ready for Independent Verification", "Git remote push", "Agent correction loop", "Pull Request automation", "multiple Workers"], "Agent Runner README");
  requiredText(runnerChangelog, ["v0.4.0", "Ready for Independent Verification", "Git remote push", "CI feedback", "Pull Request automation"], "Agent Runner CHANGELOG");

  const roadmap100 = roadmaps["100_ロードマップ"];
  const roadmap030 = roadmaps["030_ロードマップ"];
  const roadmap040 = roadmaps["040_ロードマップ"];
  requiredText(roadmap030, ["v0.3.0", "Ready for Agent"], "030_ロードマップ");
  requiredText(roadmap040, ["Phase 51", "Phase 52", "Ready for Independent Verification", "Git push", "CI feedback loop", "Pull Request", "merge", "deploy"], "040_ロードマップ");
  requiredText(roadmap100, ["v0.4.0", "Ready for Independent Verification"], "100_ロードマップ");
  if (/v0\.4\.0\s*\|\s*次期設計対象/u.test(roadmap100) || roadmap100.includes("v0.4.0 は次期設計対象")) {
    fail("100_ロードマップ still describes v0.4.0 as a future design target");
  }
  if (roadmap100.includes("現在の最終 functional boundary は、\n\n```text\nReady for Agent")) {
    fail("100_ロードマップ still describes Ready for Agent as the current final functional boundary");
  }

  return {
    roadmaps: "PASS",
    redmineMcpDocumentation: "PASS",
    agentRunnerDocumentation: "PASS",
    functionalBoundary: "PASS",
    outOfScopeBoundary: "PASS",
  };
}

function classifyPhase51Issue(issue) {
  const description = issue.description ?? "";
  if (/classification\s*:\s*Phase 51 follow-up/iu.test(description)) return "Phase 51 follow-up";
  if (/classification\s*:\s*Phase 51 blocking defect/iu.test(description)) return "Phase 51 blocking defect";
  return "Phase 51 child";
}

function evaluateRedmineState(snapshot) {
  const closedIds = new Set(snapshot.closedStatusIds);
  const issues = snapshot.issues;
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  for (const id of PHASE51_REQUIRED_CHILDREN) {
    const issue = byId.get(id);
    if (!issue) fail(`Phase 51 required child #${id} is missing from Redmine snapshot`);
    if (!closedIds.has(issue.status.id) || issue.done_ratio !== 100) fail(`Phase 51 required child #${id} is not complete`);
  }
  const followup = byId.get(PHASE51_KNOWN_FOLLOWUP);
  if (!followup || !closedIds.has(followup.status.id)) fail(`#${PHASE51_KNOWN_FOLLOWUP} Phase 51 follow-up is not closed`);

  const openIssues = issues.filter((issue) => !closedIds.has(issue.status.id) && issue.id !== PHASE51_FINAL_ISSUE);
  const openFollowups = openIssues.filter((issue) => classifyPhase51Issue(issue) === "Phase 51 follow-up");
  const openBlockingDefects = openIssues.filter((issue) => classifyPhase51Issue(issue) === "Phase 51 blocking defect");
  const openUnclassified = openIssues.filter((issue) => classifyPhase51Issue(issue) === "Phase 51 child");
  if (openFollowups.length !== 0) fail(`open Phase 51 follow-up count is ${openFollowups.length}`);
  if (openBlockingDefects.length !== 0) fail(`open Phase 51 blocking defect count is ${openBlockingDefects.length}`);
  if (openUnclassified.length !== 0) fail(`unclassified open Phase 51 child count is ${openUnclassified.length}`);

  return {
    phase51ChildStatus: issues
      .filter((issue) => issue.id !== PHASE51_FINAL_ISSUE)
      .sort((a, b) => a.id - b.id)
      .map((issue) => ({
        issueId: issue.id,
        subject: issue.subject,
        classification: classifyPhase51Issue(issue),
        statusId: issue.status.id,
        statusName: issue.status.name,
        doneRatio: issue.done_ratio,
        closed: closedIds.has(issue.status.id),
      })),
    blockingDefectCount: 0,
    openPhase51FollowUpCount: 0,
    unclassifiedOpenPhase51ChildCount: 0,
  };
}

function normalizeRedmineBaseUrl(url) {
  return url.replace(/\/+$/u, "");
}

async function redmineJson(baseUrl, apiKey, path) {
  const response = await fetch(`${normalizeRedmineBaseUrl(baseUrl)}${path}`, {
    headers: {
      "X-Redmine-API-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!response.ok) fail(`Redmine read failed (${response.status}) for ${path}`);
  return response.json();
}

async function captureLiveRedmineSnapshot({ baseUrl, apiKey, project }) {
  if (!baseUrl) fail("PHASE51_REDMINE_URL or --redmine-url is required for Final Gate live SoT verification");
  if (!apiKey) fail("PHASE51_REDMINE_API_KEY or --redmine-api-key is required for Final Gate live SoT verification");
  const statuses = await redmineJson(baseUrl, apiKey, "/issue_statuses.json");
  const closedStatusIds = statuses.issue_statuses.filter((status) => status.is_closed).map((status) => status.id);
  const list = await redmineJson(
    baseUrl,
    apiKey,
    `/issues.json?project_id=${encodeURIComponent(project)}&parent_id=${PHASE51_PARENT}&status_id=*&limit=100&sort=id%3Aasc`,
  );
  const issues = [];
  for (const summary of list.issues) {
    const detail = await redmineJson(baseUrl, apiKey, `/issues/${summary.id}.json`);
    issues.push(detail.issue);
  }
  const roadmaps = {};
  for (const title of ROADMAP_TITLES) {
    const page = await redmineJson(
      baseUrl,
      apiKey,
      `/projects/${encodeURIComponent(project)}/wiki/${encodeURIComponent(title)}.json`,
    );
    roadmaps[title] = page.wiki_page.text;
  }
  return { capturedAt: new Date().toISOString(), closedStatusIds, issues, roadmaps };
}

function loadRedmineSnapshot(path) {
  const snapshot = readJson(path);
  if (!Array.isArray(snapshot.closedStatusIds) || !Array.isArray(snapshot.issues) || typeof snapshot.roadmaps !== "object") {
    fail("offline Redmine snapshot shape is invalid");
  }
  return snapshot;
}

async function captureRedmineSnapshot(options) {
  if (options.redmineSnapshot) return loadRedmineSnapshot(options.redmineSnapshot);
  return captureLiveRedmineSnapshot({
    baseUrl: options.redmineUrl,
    apiKey: options.redmineApiKey,
    project: options.redmineProject,
  });
}

function derivePhase52MandatoryGates(manifest, phase50Policy) {
  const byId = new Map(manifest.current.remainingReleaseOnlyChecks.map((check) => [check.checkId, check]));
  const realS3 = byId.get("real-private-s3-system-release-gate");
  const environment = byId.get("sandbox-environment-conformance-system-release-gate");
  if (!realS3 || !environment) fail("manifest is missing Phase 52 mandatory release-only checks");
  if (phase50Policy.realS3?.policy !== "mandatory-per-system-release") fail("Phase 50 real S3 policy is not mandatory-per-system-release");
  if (phase50Policy.sandbox?.policy !== "mandatory-environment-conformance-per-system-release") fail("Phase 50 sandbox policy is not mandatory per system release");

  return [
    {
      checkId: realS3.checkId,
      command: phase50Policy.realS3.releaseGateCommand,
      requiredEnvironment: [
        "private S3 bucket reachable with the release Controller IAM boundary",
        "AWS credential provider available to the Agent Runner verification process",
        "AGENT_RUNNER_ARTIFACT_S3_REGION",
        "AGENT_RUNNER_ARTIFACT_S3_BUCKET",
        "AGENT_RUNNER_ARTIFACT_S3_PREFIX (optional; canonical default allowed)",
        "AGENT_RUNNER_ARTIFACT_S3_EXPECTED_BUCKET_OWNER (optional)",
        "PHASE49_REAL_S3_VERIFICATION_RECORD",
        "PHASE49_REAL_S3_TESTED_GIT_REVISION",
        "PHASE49_REAL_S3_REPOSITORY",
        "PHASE49_REAL_S3_ISSUE_ID",
        "PHASE49_REAL_S3_RETENTION_DAYS",
        "PHASE49_REAL_S3_IAM_BOUNDARY_CONFIRMED=yes",
      ],
      passCondition: "npm run verify:phase49:s3 exits 0 and persists a PASS record for the exact release source revision with required S3 semantics",
      evidenceLocation: realS3.evidenceLocation,
      blockingBehavior: realS3.blockingBehavior,
    },
    {
      checkId: environment.checkId,
      command: phase50Policy.sandbox.releaseGateCommand,
      requiredEnvironment: [
        "Agent Runner Phase 50 production-equivalent container / sandbox prerequisites",
        "real S3 configuration required by the environment-conformance route",
        "no unresolved incompatible / unsupported / contract-affecting environment finding",
      ],
      passCondition: "npm run verify:phase50:environment exits 0 and environment conformance is PASS with no unresolved mandatory coverage gap",
      evidenceLocation: environment.evidenceLocation,
      blockingBehavior: environment.blockingBehavior,
    },
  ];
}

function evidenceGenerationSummary({ redmineIdentity, redmineVerification, runnerIdentity, runnerVerification, infrastructureDecision, compatibility, manifest }) {
  return {
    redmineMcp: {
      rcIdentity: { generation: redmineIdentity.generation, generationId: redmineIdentity.generationId },
      rcVerification: { generation: redmineVerification.generation, generationId: redmineVerification.generationId },
    },
    agentRunner: {
      rcIdentity: { generation: runnerIdentity.generation, generationId: runnerIdentity.generationId },
      rcVerification: { generation: runnerVerification.generation, generationId: runnerVerification.generationId },
      realInfrastructureDecision: { generation: infrastructureDecision.generation, generationId: infrastructureDecision.generationId },
    },
    crossComponentCompatibility: { generation: compatibility.generation, generationId: compatibility.generationId },
    releaseCompatibilityManifest: { generation: manifest.generation, generationId: manifest.generationId },
  };
}

function contractMap(contracts, field) {
  return Object.fromEntries(sortedContracts(contracts).map((entry) => [entry.contractId, entry[field]]));
}

function makeCurrent({
  redmineIdentity,
  redmineVerification,
  runnerIdentity,
  runnerVerification,
  infrastructureDecision,
  compatibility,
  manifest,
  registry,
  profile,
  phase50Final,
  phase52MandatoryGates,
  redmineState,
  documentationAlignment,
  verifiedAt,
}) {
  return {
    componentVersions: {
      redmineMcp: redmineIdentity.current.componentVersion,
      agentRunner: runnerIdentity.current.componentVersion,
    },
    componentSourceRevisions: {
      redmineMcp: redmineIdentity.current.exactSourceRevision,
      agentRunner: runnerIdentity.current.exactSourceRevision,
    },
    componentEvidenceGenerations: evidenceGenerationSummary({
      redmineIdentity,
      redmineVerification,
      runnerIdentity,
      runnerVerification,
      infrastructureDecision,
      compatibility,
      manifest,
    }),
    componentEvidenceGenerationIds: {
      redmineMcpRcIdentity: redmineIdentity.generationId,
      redmineMcpRcVerification: redmineVerification.generationId,
      agentRunnerRcIdentity: runnerIdentity.generationId,
      agentRunnerRcVerification: runnerVerification.generationId,
      agentRunnerRealInfrastructureDecision: infrastructureDecision.generationId,
      crossComponentCompatibility: compatibility.generationId,
      releaseCompatibilityManifest: manifest.generationId,
    },
    contractSemanticRevisions: contractMap(registry.contracts, "semanticRevision"),
    contractSourceRevisions: contractMap(registry.contracts, "sourceRevision"),
    contractBlobIdentities: contractMap(registry.contracts, "sourceBlobSha"),
    expectedHandoffProfileIdentity: {
      path: INPUT_PATHS.profile,
      schemaVersion: profile.schemaVersion,
      profileId: profile.profileId,
      contractReferences: profile.contractReferences,
    },
    phase51ChildStatus: redmineState.phase51ChildStatus,
    redmineMcpRcVerificationResult: redmineVerification.current.result,
    agentRunnerRcVerificationResult: runnerVerification.current.result,
    realInfrastructureDecisionResult: infrastructureDecision.current.changeTriggeredRealS3.result,
    layerACompatibilityResult: compatibility.current.layerA.contractVsProducer === "PASS" && compatibility.current.layerA.contractVsConsumer === "PASS" ? "PASS" : "FAIL",
    producerConstraintConformanceResult: compatibility.current.layerA.producerConstraintConformance,
    consumerConstraintConformanceResult: compatibility.current.layerA.consumerConstraintConformance,
    fingerprintSourceBindingResult: compatibility.current.layerA.fingerprintImplementationBinding,
    layerBCompatibilityResult: compatibility.current.layerB.contractDerivedFixture.result === "PASS" && compatibility.current.layerB.producerRepresentation.result === "PASS" && compatibility.current.layerB.consumerValidation.result === "PASS" ? "PASS" : "FAIL",
    requirementsFingerprintCompatibilityResult: compatibility.current.requirementsFingerprintCompatibilityResult,
    phase50GoldenBaselineResult: compatibility.current.phase50GoldenBaseline.result,
    crossComponentCompatibilityResult: compatibility.current.result,
    manifestValidationResult: "PASS",
    contractRegistryValidationResult: "PASS",
    contractBlobVerificationResult: "PASS",
    fingerprintSourceBlobVerificationResult: "PASS",
    evidenceSchemaValidationResult: "PASS",
    documentationAlignmentResult: documentationAlignment,
    blockingDefectCount: redmineState.blockingDefectCount,
    openPhase51FollowUpCount: redmineState.openPhase51FollowUpCount,
    blockingIncompatibilityCount: compatibility.current.blockingIncompatibilityCount,
    staleEvidenceCount: 0,
    phase52MandatoryGates,
    knownLimitations: manifest.current.knownLimitations,
    outOfScopeBoundary: phase50Final.outOfScope,
    result: "PASS",
    verifiedAt,
  };
}

function makeInitialRecord(current) {
  return {
    schemaVersion: 1,
    recordType: RECORD_TYPE,
    generation: 1,
    generationId: generationId(RECORD_TYPE, 1, current),
    current,
    history: [],
    supersedes: null,
  };
}

function makeReentryRecord(existing, current, { invalidationReason, invalidatingDefectIssueId, invalidatedAt }) {
  assertRecordEnvelope(existing, RECORD_TYPE);
  if (!invalidationReason?.trim()) fail("--replace-existing requires --invalidation-reason");
  if (invalidationReason.startsWith("blocking-defect:") && !Number.isInteger(invalidatingDefectIssueId)) {
    fail("blocking-defect re-entry requires --invalidating-defect-issue-id");
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

function renderHandoff({ record, manifest, registry, profile, phase50Final, phase52MandatoryGates }) {
  const c = record.current;
  const contractRows = sortedContracts(registry.contracts)
    .map((entry) => `| ${entry.contractId} | ${entry.semanticRevision} | \`${entry.sourceRevision}\` | \`${entry.sourceBlobSha}\` |`)
    .join("\n");
  const gateSections = phase52MandatoryGates.map((gate) => [
    `### ${gate.checkId}`,
    "",
    `- Command: \`${gate.command}\``,
    `- PASS condition: ${gate.passCondition}`,
    `- Evidence location: \`${gate.evidenceLocation}\``,
    `- Blocking behavior: ${gate.blockingBehavior}`,
    "- Required environment:",
    ...gate.requiredEnvironment.map((item) => `  - ${item}`),
  ].join("\n")).join("\n\n");

  return `# Phase 51 -> Phase 52 Handoff\n\n` +
    `System milestone: **v${manifest.current.platformMilestone}**\n\n` +
    `Phase 51 final verification: **PASS** (generation ${record.generation}, \`${record.generationId}\`)\n\n` +
    `## Compatible components\n\n` +
    `- Redmine MCP: version \`${c.componentVersions.redmineMcp}\`, exact source \`${c.componentSourceRevisions.redmineMcp}\`\n` +
    `  - RC identity: \`${INPUT_PATHS.redmineIdentity}\`\n` +
    `  - RC verification: \`${INPUT_PATHS.redmineVerification}\`\n` +
    `- Agent Runner: version \`${c.componentVersions.agentRunner}\`, exact source \`${c.componentSourceRevisions.agentRunner}\`\n` +
    `  - RC identity: \`${INPUT_PATHS.runnerIdentity}\`\n` +
    `  - RC verification: \`${INPUT_PATHS.runnerVerification}\`\n` +
    `  - Real-infrastructure decision: \`${INPUT_PATHS.infrastructureDecision}\`\n\n` +
    `## Contract identities\n\n` +
    `| Contract | semanticRevision | sourceRevision | sourceBlobSha |\n| --- | ---: | --- | --- |\n${contractRows}\n\n` +
    `Canonical expected handoff profile: \`${INPUT_PATHS.profile}\` (schemaVersion=${profile.schemaVersion}, profileId=${profile.profileId})\n\n` +
    `## Canonical release evidence\n\n` +
    `- Release compatibility manifest: \`${INPUT_PATHS.manifest}\`\n` +
    `- Phase 50 final verification: \`${INPUT_PATHS.phase50Final}\` (tested revision \`${phase50Final.testedGitRevision}\`)\n` +
    `- Phase 51 compatibility verification: \`${INPUT_PATHS.compatibility}\`\n` +
    `- Phase 51 final verification: \`${FINAL_EVIDENCE_PATH}\`\n\n` +
    `## Phase 52 mandatory system-release gates\n\n${gateSections}\n\n` +
    `Phase 51 change-triggered real-S3 decision does **not** replace these mandatory system-release gates.\n\n` +
    `## Remaining release-only checks\n\n` +
    phase52MandatoryGates.map((gate) => `- ${gate.checkId}: required before system release`).join("\n") +
    `\n\n## Known limitations\n\n` +
    c.knownLimitations.map((item) => `- ${item}`).join("\n") +
    `\n\n## Out-of-scope boundary\n\n` +
    c.outOfScopeBoundary.map((item) => `- ${item}`).join("\n") +
    `\n\nPhase 52 may execute the release-only gates and system release without adding a new architecture, execution contract, artifact contract, or product capability.\n`;
}

function validateFinalEvidenceAgainstCurrent(record, expectedCurrent) {
  assertRecordEnvelope(record, RECORD_TYPE);
  const projection = structuredClone(record.current);
  delete projection.verifiedAt;
  const expectedProjection = structuredClone(expectedCurrent);
  delete expectedProjection.verifiedAt;
  if (!stableEqual(projection, expectedProjection)) fail("existing Phase 51 final verification is stale against current canonical inputs");
  if (record.current.result !== "PASS") fail("Phase 51 final verification result is not PASS");
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    redmineUrl: process.env.PHASE51_REDMINE_URL ?? "",
    redmineApiKey: process.env.PHASE51_REDMINE_API_KEY ?? "",
    redmineProject: process.env.PHASE51_REDMINE_PROJECT ?? "mcp_redmine",
    redmineSnapshot: null,
    validateOnly: false,
    replaceExisting: false,
    invalidationReason: null,
    invalidatingDefectIssueId: null,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.root = resolve(argv[++i]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++i]);
    else if (arg === "--redmine-url") options.redmineUrl = argv[++i];
    else if (arg === "--redmine-api-key") options.redmineApiKey = argv[++i];
    else if (arg === "--redmine-project") options.redmineProject = argv[++i];
    else if (arg === "--redmine-snapshot") options.redmineSnapshot = resolve(argv[++i]);
    else if (arg === "--validate-only") options.validateOnly = true;
    else if (arg === "--replace-existing") options.replaceExisting = true;
    else if (arg === "--invalidation-reason") options.invalidationReason = argv[++i];
    else if (arg === "--invalidating-defect-issue-id") options.invalidatingDefectIssueId = Number(argv[++i]);
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function selfTest() {
  const current = { result: "PASS", value: 1, verifiedAt: "2026-09-23T00:00:00Z" };
  const initial = makeInitialRecord(current);
  assertRecordEnvelope(initial, RECORD_TYPE);
  const reentry = makeReentryRecord(initial, { ...current, value: 2 }, {
    invalidationReason: "blocking-defect: self-test",
    invalidatingDefectIssueId: 9999,
    invalidatedAt: "2026-09-23T01:00:00Z",
  });
  assertRecordEnvelope(reentry, RECORD_TYPE);

  const snapshot = {
    closedStatusIds: [5],
    issues: [5434, 5435, 5436, 5437, 5438, 5440].map((id) => ({
      id,
      subject: `self-test-${id}`,
      description: id === 5440 ? "classification: Phase 51 follow-up" : "",
      status: { id: 5, name: "終了" },
      done_ratio: 100,
    })).concat([{ id: 5439, subject: "final", description: "", status: { id: 1, name: "新規" }, done_ratio: 0 }]),
    roadmaps: {},
  };
  const evaluated = evaluateRedmineState(snapshot);
  if (evaluated.blockingDefectCount !== 0 || evaluated.openPhase51FollowUpCount !== 0) fail("Redmine state self-test failed");

  let detectedRoadmapDrift = false;
  try {
    requiredText("v0.4.0 next", ["Ready for Independent Verification"], "self-test-roadmap");
  } catch {
    detectedRoadmapDrift = true;
  }
  if (!detectedRoadmapDrift) fail("documentation drift negative control failed");

  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    generationId: "PASS",
    reentryHistory: "PASS",
    redmineClassification: "PASS",
    documentationDriftNegativeControl: "PASS",
  }, null, 2)}\n`);
}

async function main(options) {
  if (options.selfTest) return selfTest();
  const root = resolve(options.root);
  if (!options.runnerRoot) fail("--runner-root is required");
  const runnerRoot = resolve(options.runnerRoot);

  const records = {
    redmineIdentity: readJson(resolve(root, INPUT_PATHS.redmineIdentity)),
    redmineVerification: readJson(resolve(root, INPUT_PATHS.redmineVerification)),
    runnerIdentity: readJson(resolve(root, INPUT_PATHS.runnerIdentity)),
    runnerVerification: readJson(resolve(root, INPUT_PATHS.runnerVerification)),
    infrastructureDecision: readJson(resolve(root, INPUT_PATHS.infrastructureDecision)),
    compatibility: readJson(resolve(root, INPUT_PATHS.compatibility)),
    manifest: readJson(resolve(root, INPUT_PATHS.manifest)),
  };
  const registry = readJson(resolve(root, INPUT_PATHS.registry));
  const profile = readJson(resolve(root, INPUT_PATHS.profile));
  const phase50Final = readJson(resolve(runnerRoot, INPUT_PATHS.phase50Final));
  const phase50Policy = readJson(resolve(runnerRoot, INPUT_PATHS.phase50Policy));

  assertRecordEnvelope(records.redmineIdentity, "redmine-mcp-rc-identity");
  assertRecordEnvelope(records.redmineVerification, "redmine-mcp-rc-verification");
  assertRecordEnvelope(records.runnerIdentity, "agent-runner-rc-identity");
  assertRecordEnvelope(records.runnerVerification, "agent-runner-rc-verification");
  assertRecordEnvelope(records.infrastructureDecision, "agent-runner-real-infrastructure-decision");
  assertRecordEnvelope(records.compatibility, "cross-component-compatibility");
  assertRecordEnvelope(records.manifest, "release-compatibility-manifest");

  assertExactCleanRunnerCheckout(runnerRoot, records.runnerIdentity.current.exactSourceRevision);
  runStrictRegistryValidation(root);
  runManifestValidation(root, runnerRoot);
  await validateEvidenceSchema(root, Object.values(records));
  verifyRevisionClosure({ registry, ...records });
  verifyProfileAgainstRegistry(profile, registry);
  verifyContractBlobs({
    root,
    runnerRoot,
    registry,
    redmineRcRevision: records.redmineIdentity.current.exactSourceRevision,
    runnerRcRevision: records.runnerIdentity.current.exactSourceRevision,
  });
  verifyFingerprintSourceBlobs({ root, redmineVerification: records.redmineVerification, runnerVerification: records.runnerVerification });
  verifyRunnerFingerprintBinding({ runnerRoot, runnerVerification: records.runnerVerification });
  if (phase50Final.result !== "PASS") fail("Phase 50 final verification is not PASS");

  const entrySnapshot = await captureRedmineSnapshot(options);
  const entryState = evaluateRedmineState(entrySnapshot);
  const documentationAlignment = validateDocumentationAlignment({ root, runnerRoot, roadmaps: entrySnapshot.roadmaps });
  const phase52MandatoryGates = derivePhase52MandatoryGates(records.manifest, phase50Policy);

  const verifiedAt = new Date().toISOString();
  const current = makeCurrent({
    ...records,
    registry,
    profile,
    phase50Final,
    phase52MandatoryGates,
    redmineState: entryState,
    documentationAlignment,
    verifiedAt,
  });

  const finalPath = resolve(root, FINAL_EVIDENCE_PATH);
  const handoffPath = resolve(root, HANDOFF_PATH);

  if (options.validateOnly) {
    if (!existsSync(finalPath) || !existsSync(handoffPath)) fail("Phase 51 final verification / handoff output is missing");
    const existing = readJson(finalPath);
    validateFinalEvidenceAgainstCurrent(existing, current);
    await validateEvidenceSchema(root, [existing]);
    const handoff = readFileSync(handoffPath, "utf8");
    requiredText(handoff, [
      "Phase 51 -> Phase 52 Handoff",
      records.redmineIdentity.current.exactSourceRevision,
      records.runnerIdentity.current.exactSourceRevision,
      "npm run verify:phase49:s3",
      "npm run verify:phase50:environment",
      existing.generationId,
    ], "Phase 52 handoff");
    const exitSnapshot = await captureRedmineSnapshot(options);
    evaluateRedmineState(exitSnapshot);
    validateDocumentationAlignment({ root, runnerRoot, roadmaps: exitSnapshot.roadmaps });
    process.stdout.write(`Phase 51-6 Final Gate validation PASS: ${finalPath}\n`);
    return;
  }

  let record;
  if (existsSync(finalPath)) {
    if (!options.replaceExisting) fail(`${FINAL_EVIDENCE_PATH} already exists; use --replace-existing with an invalidation reason for re-entry`);
    const existing = readJson(finalPath);
    record = makeReentryRecord(existing, current, {
      invalidationReason: options.invalidationReason,
      invalidatingDefectIssueId: options.invalidatingDefectIssueId,
      invalidatedAt: verifiedAt,
    });
  } else {
    if (options.replaceExisting) fail("--replace-existing was requested but no existing Final Gate evidence exists");
    record = makeInitialRecord(current);
  }

  const exitSnapshot = await captureRedmineSnapshot(options);
  const exitState = evaluateRedmineState(exitSnapshot);
  validateDocumentationAlignment({ root, runnerRoot, roadmaps: exitSnapshot.roadmaps });
  if (!stableEqual(entryState, exitState)) fail("Phase 51 Redmine entry / exit state changed during Final Gate execution");

  await validateEvidenceSchema(root, [record]);
  const handoff = renderHandoff({
    record,
    manifest: records.manifest,
    registry,
    profile,
    phase50Final,
    phase52MandatoryGates,
  });

  writeFileSync(finalPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  writeFileSync(handoffPath, handoff, "utf8");

  process.stdout.write(`Phase 51-6 Final Gate PASS: ${finalPath}\n`);
  process.stdout.write(`Phase 52 handoff: ${handoffPath}\n`);
}

const options = parseArgs(process.argv.slice(2));
main(options).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
