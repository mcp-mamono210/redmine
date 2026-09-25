#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertEvidenceRevisionReachableFromMain,
  assertNoReleaseFreezeViolations,
  defaultRun,
  gitBlobShaAtRevision,
  gitChangedPaths,
  makeInitialEvidenceRecord,
  readJson,
  readPhase52Schema,
  requireSuccess,
  sha256Bytes,
  validateEvidenceAgainstSchema,
} from "./common.mjs";

const FULL_GIT_REVISION = /^[0-9a-f]{40,64}$/u;
const PHASE51_FINAL_PATH = "docs/verification/phase51-final-verification.json";
const MANIFEST_PATH = "docs/verification/v0.4.0-release-compatibility-manifest.json";
const HANDOFF_PATH = "docs/verification/phase51-phase52-handoff.md";
const REAL_S3_GATE_PATH = "docs/verification/phase52-real-s3-system-release-gate.json";
const ENVIRONMENT_GATE_PATH = "docs/verification/phase52-environment-conformance-system-release-gate.json";
const REGISTRY_PATH = "docs/contracts/system-release-compatibility-contract-registry.json";
const SYSTEM_RECORD_TYPE = "v0.4.0-system-release";
const SYSTEM_MILESTONE = "v0.4.0";
const RUNNER_PRODUCTION_RUNTIME_PATH = "src/controller/phase49-5-runtime.ts";
const RUNNER_SANDBOX_RUNTIME_PATH = "src/sandbox/docker-runtime.ts";
const RUNNER_PHASE50_SECURITY_EVIDENCE_PATH = "docs/verification/phase50-7-artifact-restore-security-resource-regression.md";
const RUNNER_PACKAGE_PATH = "package.json";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    runnerRcRoot: null,
    redmineMain: "origin/main",
    runnerMain: "origin/main",
    dryRun: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--runner-rc-root") options.runnerRcRoot = resolve(argv[++index]);
    else if (arg === "--redmine-main") options.redmineMain = argv[++index];
    else if (arg === "--runner-main") options.runnerMain = argv[++index];
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  if (!options.selfTest) {
    if (!options.dryRun) fail("Phase 52-3 generator requires --dry-run; final publication belongs to Phase 52-4");
    if (options.runnerRoot === null) fail("--runner-root is required");
    if (options.runnerRcRoot === null) fail("--runner-rc-root is required");
  }
  return options;
}

function readText(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

function parseCompatibleComponent(text, label) {
  const prefix = `- ${label}: version `;
  const line = text.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
  if (!line) fail(`Phase 51 handoff is missing ${label} compatible component identity`);
  const match = line.match(/^- .+?: version `([^`]+)`, exact source `([0-9a-f]{40,64})`/u);
  if (!match) fail(`Phase 51 handoff has invalid ${label} compatible component identity`);
  return { componentVersion: match[1], exactSourceRevision: match[2] };
}

function parseContractTable(text) {
  const contracts = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([1-9]\d*)\s*\|\s*`([0-9a-f]{40,64})`\s*\|\s*`([0-9a-f]{40})`\s*\|$/u);
    if (!match) continue;
    contracts.push({
      contractId: match[1].trim(),
      semanticRevision: Number(match[2]),
      sourceRevision: match[3],
      sourceBlobSha: match[4],
    });
  }
  if (contracts.length === 0) fail("Phase 51 handoff contract identity table is empty");
  return contracts;
}

function parseGatePolicyReference(text, checkId) {
  const marker = `### ${checkId}`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`Phase 51 handoff is missing gate section ${checkId}`);
  const next = text.indexOf("\n### ", start + marker.length);
  const section = text.slice(start, next < 0 ? text.length : next);
  const location = section.match(/- Evidence location: `([^`]+)`/u)?.[1];
  if (!location) fail(`${checkId} does not declare Evidence location`);
  return {
    checkId,
    interpretation: "policyReference",
    repository: "mcp-mamono210/ai-agent-runner",
    path: location,
  };
}

function parseHandoff(text) {
  const milestone = text.match(/System milestone:\s*\*\*([^*]+)\*\*/u)?.[1]?.trim();
  if (milestone !== SYSTEM_MILESTONE) fail(`unexpected system milestone in Phase 51 handoff: ${String(milestone)}`);

  const profile = text.match(/Canonical expected handoff profile: `([^`]+)` \(schemaVersion=([1-9]\d*), profileId=([^\)]+)\)/u);
  if (!profile) fail("Phase 51 handoff is missing canonical expected handoff profile identity");

  return {
    systemMilestone: milestone,
    compatibleComponents: {
      redmineMcp: parseCompatibleComponent(text, "Redmine MCP"),
      agentRunner: parseCompatibleComponent(text, "Agent Runner"),
    },
    contractIdentities: parseContractTable(text),
    expectedHandoffProfile: {
      path: profile[1],
      schemaVersion: Number(profile[2]),
      profileId: profile[3],
    },
    phase51GatePolicyReferences: [
      parseGatePolicyReference(text, "real-private-s3-system-release-gate"),
      parseGatePolicyReference(text, "sandbox-environment-conformance-system-release-gate"),
    ],
  };
}

function stable(value) {
  return JSON.stringify(value);
}

function assertSame(label, actual, expected) {
  if (stable(actual) !== stable(expected)) {
    fail(`${label} mismatch`);
  }
}

function assertPhase51InputClosure({ handoff, finalVerification, manifest }) {
  if (finalVerification?.current?.result !== "PASS") fail("Phase 51 final verification is not PASS");
  if (manifest?.current?.result !== "PASS") fail("release compatibility manifest is not PASS");
  if (manifest?.current?.platformMilestone !== SYSTEM_MILESTONE) fail("release compatibility manifest milestone mismatch");

  const finalComponents = {
    redmineMcp: {
      componentVersion: finalVerification.current.componentVersions.redmineMcp,
      exactSourceRevision: finalVerification.current.componentSourceRevisions.redmineMcp,
    },
    agentRunner: {
      componentVersion: finalVerification.current.componentVersions.agentRunner,
      exactSourceRevision: finalVerification.current.componentSourceRevisions.agentRunner,
    },
  };
  assertSame("Phase 51 handoff/final component identity", handoff.compatibleComponents, finalComponents);

  const manifestComponents = {
    redmineMcp: {
      componentVersion: manifest.current.redmineMcp.componentVersion,
      exactSourceRevision: manifest.current.redmineMcp.exactSourceRevision,
    },
    agentRunner: {
      componentVersion: manifest.current.agentRunner.componentVersion,
      exactSourceRevision: manifest.current.agentRunner.exactSourceRevision,
    },
  };
  assertSame("Phase 51 handoff/manifest component identity", handoff.compatibleComponents, manifestComponents);

  assertSame("contract identities", handoff.contractIdentities, manifest.current.contracts);
  assertSame("expected handoff profile", handoff.expectedHandoffProfile, {
    path: manifest.current.expectedHandoffProfile.path,
    schemaVersion: manifest.current.expectedHandoffProfile.schemaVersion,
    profileId: manifest.current.expectedHandoffProfile.profileId,
  });
}

function gitShow({ repositoryRoot, revision, path, run = defaultRun }) {
  return requireSuccess(
    run("git", ["-C", repositoryRoot, "show", `${revision}:${path}`], { cwd: repositoryRoot }),
    `git show ${revision}:${path}`,
  );
}

function validateGateEvidence({
  gate,
  expectedRecordType,
  expectedTestedSourceRevision,
  runnerRoot,
  runnerMain,
  schema,
  run = defaultRun,
}) {
  validateEvidenceAgainstSchema(gate, schema);
  if (gate.recordType !== expectedRecordType) fail(`${expectedRecordType} recordType mismatch`);
  if (gate.current.result !== "PASS") fail(`${expectedRecordType} current result is not PASS`);
  if (gate.current.testedSourceRevision !== expectedTestedSourceRevision) {
    fail(`${expectedRecordType} testedSourceRevision does not match Agent Runner exact RC`);
  }
  if (gate.current.evidenceRepository !== "mcp-mamono210/ai-agent-runner") {
    fail(`${expectedRecordType} evidenceRepository mismatch`);
  }

  const actualBlobSha = gitBlobShaAtRevision({
    repositoryRoot: runnerRoot,
    revision: gate.current.evidenceRevision,
    path: gate.current.evidencePath,
    run,
  });
  if (actualBlobSha !== gate.current.evidenceBlobSha) {
    fail(`${expectedRecordType} evidenceBlobSha mismatch`);
  }

  const raw = gitShow({
    repositoryRoot: runnerRoot,
    revision: gate.current.evidenceRevision,
    path: gate.current.evidencePath,
    run,
  });
  const actualRawSha = `sha256:${sha256Bytes(raw)}`;
  if (actualRawSha !== gate.current.rawRecordSha256) {
    fail(`${expectedRecordType} rawRecordSha256 mismatch`);
  }

  assertEvidenceRevisionReachableFromMain({
    repositoryRoot: runnerRoot,
    evidenceRevision: gate.current.evidenceRevision,
    remoteMain: runnerMain,
    run,
  });

  const verificationFacts = expectedRecordType === "phase52-real-s3-system-release-gate"
    ? {
        roleName: gate.current.roleName ?? null,
        iamAttestationResult: gate.current.iamAttestationResult ?? null,
        iamNegativeVerificationResult: gate.current.iamNegativeVerificationResult ?? null,
      }
    : {
        environmentConformanceResult: gate.current.environmentConformanceResult ?? null,
        unresolvedMandatoryCoverageGapCount: gate.current.unresolvedMandatoryCoverageGapCount ?? null,
        productionDeploymentCertification: gate.current.productionDeploymentCertification ?? null,
      };

  return {
    canonicalEvidencePath: expectedRecordType === "phase52-real-s3-system-release-gate"
      ? REAL_S3_GATE_PATH
      : ENVIRONMENT_GATE_PATH,
    generation: gate.generation,
    generationId: gate.generationId,
    testedSourceRevision: gate.current.testedSourceRevision,
    evidenceRepository: gate.current.evidenceRepository,
    evidenceRevision: gate.current.evidenceRevision,
    evidencePath: gate.current.evidencePath,
    evidenceBlobSha: gate.current.evidenceBlobSha,
    rawRecordSha256: gate.current.rawRecordSha256,
    executionHost: gate.current.executionHost ?? null,
    verificationFacts,
    result: gate.current.result,
  };
}

function verifyGatePolicyReferences({ references, runnerRoot, runnerRevision, run = defaultRun }) {
  return references.map((reference) => {
    if (reference.interpretation !== "policyReference") {
      fail(`${reference.checkId} must remain a policyReference`);
    }
    if (reference.repository !== "mcp-mamono210/ai-agent-runner") {
      fail(`${reference.checkId} policy reference repository mismatch`);
    }
    const sourceBlobSha = gitBlobShaAtRevision({
      repositoryRoot: runnerRoot,
      revision: runnerRevision,
      path: reference.path,
      run,
    });
    return {
      ...reference,
      sourceRevision: runnerRevision,
      sourceBlobSha,
      actualGateResultSource: reference.checkId === "real-private-s3-system-release-gate"
        ? REAL_S3_GATE_PATH
        : ENVIRONMENT_GATE_PATH,
    };
  });
}

function runGitStatusForPhase51Evidence({ root, run = defaultRun }) {
  const output = requireSuccess(
    run("git", ["-C", root, "status", "--porcelain", "--", "docs/verification"], { cwd: root }),
    "git status Phase 51 evidence",
  );
  return output.split(/\r?\n/u).filter((line) =>
    /docs\/verification\/(?:phase51-|v0\.4\.0-release-compatibility-manifest\.json)/u.test(line));
}

function runPhase51ReadOnlyRevalidation({ root, runnerRcRoot, run = defaultRun }) {
  const before = runGitStatusForPhase51Evidence({ root, run });
  if (before.length > 0) fail(`Phase 51 evidence is dirty before read-only revalidation: ${before.join(", ")}`);

  requireSuccess(
    run(process.execPath, [
      resolve(root, "scripts/phase51/validate-system-release-compatibility.mjs"),
      "--mode",
      "strict",
      "--negative-controls",
    ], { cwd: root, env: process.env }),
    "Phase 51 strict validation",
  );

  requireSuccess(
    run(process.execPath, [
      resolve(root, "scripts/phase51/verify-phase51-final-gate.mjs"),
      "--runner-root",
      runnerRcRoot,
      "--validate-only",
    ], { cwd: root, env: process.env }),
    "Phase 51 final gate --validate-only",
  );

  const after = runGitStatusForPhase51Evidence({ root, run });
  if (after.length > 0) fail(`Phase 51 evidence changed during read-only revalidation: ${after.join(", ")}`);

  return {
    strictValidation: "PASS",
    finalGateValidateOnly: "PASS",
    phase51EvidenceMutationCount: 0,
  };
}

function verifyReleaseFreeze({ root, runnerRoot, handoff, redmineMain, runnerMain, run = defaultRun }) {
  const redmineChangedPaths = gitChangedPaths({
    repositoryRoot: root,
    baseRevision: handoff.compatibleComponents.redmineMcp.exactSourceRevision,
    head: redmineMain,
    run,
  });
  const runnerChangedPaths = gitChangedPaths({
    repositoryRoot: runnerRoot,
    baseRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
    head: runnerMain,
    run,
  });

  const redmine = assertNoReleaseFreezeViolations(redmineChangedPaths);
  const agentRunner = assertNoReleaseFreezeViolations(runnerChangedPaths);

  return {
    result: "PASS",
    redmineMcp: {
      baseRevision: handoff.compatibleComponents.redmineMcp.exactSourceRevision,
      head: redmineMain,
      changedPaths: redmineChangedPaths,
      forbiddenChangeCount: redmine.frozen.length,
    },
    agentRunner: {
      baseRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
      head: runnerMain,
      changedPaths: runnerChangedPaths,
      forbiddenChangeCount: agentRunner.frozen.length,
    },
  };
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function literalFirstArgument(callText) {
  const match = callText.match(/^\s*(["'`])([^"'`$]*)\1/u);
  return match ? match[2] : null;
}

function scanImportedChildProcessBindings(content) {
  const bindings = [];
  const named = /import\s*\{([^}]+)\}\s*from\s*["'](?:node:)?child_process["']/gu;
  for (const match of content.matchAll(named)) {
    for (const raw of match[1].split(",")) {
      const token = raw.trim();
      const alias = token.match(/^(execFileSync|execFile|execSync|exec|spawnSync|spawn|fork)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u);
      if (alias) bindings.push({ api: alias[1], local: alias[2] ?? alias[1] });
    }
  }
  const namespaces = [];
  const namespace = /import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*["'](?:node:)?child_process["']/gu;
  for (const match of content.matchAll(namespace)) namespaces.push(match[1]);
  return { bindings, namespaces };
}

function scanProcessLaunchSitesInText(path, content) {
  const sites = [];
  const seen = new Set();
  const { bindings, namespaces } = scanImportedChildProcessBindings(content);

  function addSite(api, localExpression, offset, afterOpenParen) {
    const key = `${api}:${offset}`;
    if (seen.has(key)) return;
    seen.add(key);
    const executable = literalFirstArgument(afterOpenParen);
    const allowedGitPersistence = path === "src/agent-brief/persistence.ts"
      && api === "execFile"
      && executable === "git";
    sites.push({
      path,
      line: lineNumberAt(content, offset),
      symbol: localExpression,
      api,
      launchedExecutable: executable,
      purpose: allowedGitPersistence
        ? "Agent Brief persistence Git process"
        : "unresolved-or-noncanonical process launch",
      allowedGitPersistence,
    });
  }

  for (const binding of bindings) {
    const pattern = new RegExp(`\\b${binding.local.replace(/[$]/gu, "\\$")}\\s*\\(`, "gu");
    for (const match of content.matchAll(pattern)) {
      addSite(binding.api, binding.local, match.index, content.slice(match.index + match[0].length));
    }
  }

  for (const namespaceName of namespaces) {
    for (const api of ["execFileSync", "execFile", "execSync", "exec", "spawnSync", "spawn", "fork"]) {
      const pattern = new RegExp(`\\b${namespaceName.replace(/[$]/gu, "\\$")}\\.${api}\\s*\\(`, "gu");
      for (const match of content.matchAll(pattern)) {
        addSite(api, `${namespaceName}.${api}`, match.index, content.slice(match.index + match[0].length));
      }
    }
  }

  const requirePattern = /(?:require\s*\(\s*["'](?:node:)?child_process["']\s*\)|[A-Za-z_$][\w$]*)\s*\.\s*(execFileSync|execFile|execSync|exec|spawnSync|spawn|fork)\s*\(/gu;
  for (const match of content.matchAll(requirePattern)) {
    const api = match[1];
    addSite(api, match[0].slice(0, -1).trim(), match.index, content.slice(match.index + match[0].length));
  }

  return sites;
}

function scanRedmineProcessLaunchSites({ root, revision, run = defaultRun }) {
  if (!FULL_GIT_REVISION.test(revision)) fail("Redmine MCP exact RC must be a full Git revision");
  const paths = requireSuccess(
    run("git", ["-C", root, "ls-tree", "-r", "--name-only", revision, "--", "src"], { cwd: root }),
    "git ls-tree Redmine MCP exact RC src",
  ).split(/\r?\n/u).filter((path) => /\.(?:[cm]?js|tsx?)$/u.test(path));

  const sites = [];
  for (const path of paths) {
    const content = gitShow({ repositoryRoot: root, revision, path, run });
    sites.push(...scanProcessLaunchSitesInText(path, content));
  }

  const unexpected = sites.filter((site) => !site.allowedGitPersistence);
  if (unexpected.length > 0) {
    fail(`unknown / unresolved process-launch site found: ${unexpected.map((site) => `${site.path}:${site.line}:${site.api}`).join(", ")}`);
  }

  if (sites.length !== 1) {
    fail(`expected exactly one canonical Redmine MCP process-launch site, found ${sites.length}`);
  }

  return {
    repository: "mcp-mamono210/redmine",
    exactSourceRevision: revision,
    scope: "src/**",
    processLaunchSites: sites.map(({ allowedGitPersistence, ...site }) => site),
    agentProcessLaunchSiteCount: 0,
    agentRunnerProcessLaunchSiteCount: 0,
    unknownProcessLaunchWrapperCount: 0,
    result: "PASS",
  };
}

function verifyCredentialBoundary({ root, runnerRoot, handoff, manifest, registry, run = defaultRun }) {
  const contract = registry.contracts?.find((entry) => entry.contractId === "agent-runner-security-sandbox");
  if (!contract || contract.registrationState !== "committed") {
    fail("registered agent-runner-security-sandbox contract is unavailable or not committed");
  }
  const manifestIdentity = manifest.current.contracts.find((entry) => entry.contractId === contract.contractId);
  assertSame("agent-runner-security-sandbox contract identity", {
    contractId: contract.contractId,
    semanticRevision: contract.semanticRevision,
    sourceRevision: contract.sourceRevision,
    sourceBlobSha: contract.sourceBlobSha,
  }, manifestIdentity);

  const contractText = gitShow({
    repositoryRoot: root,
    revision: contract.sourceRevision,
    path: contract.path,
    run,
  });
  for (const requiredPhrase of [
    "Git remote write credential",
    "Redmine Writer credential",
    "Controller credential",
    "unavailable to Agent",
    "Credential values are secret-bearing runtime inputs, not execution identity",
  ]) {
    if (!contractText.includes(requiredPhrase)) {
      fail(`credential contract evidence is missing required phrase: ${requiredPhrase}`);
    }
  }

  const phase50Path = manifest.current.verification?.phase50FinalVerification?.path;
  if (typeof phase50Path !== "string" || phase50Path === "") fail("manifest is missing Phase 50 final verification path");
  const phase50 = JSON.parse(gitShow({
    repositoryRoot: runnerRoot,
    revision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
    path: phase50Path,
    run,
  }));
  if (phase50.result !== "PASS" || phase50.verificationCommands?.environmentConformance !== "PASS") {
    fail("Phase 50 credential / environment regression evidence is not PASS");
  }

  return {
    result: "PASS",
    acceptanceScope: "design-and-implementation-separation-only",
    contractIdentity: manifestIdentity,
    agentVisibleCredentialRules: {
      redmineWriterCredential: "unavailable",
      controllerCredential: "unavailable",
      gitRemoteWriteCredential: "unavailable",
      durableCredentialValuePersistence: "prohibited",
    },
    deploymentCredentialIdentitySeparation: "DEFERRED_TO_DEPLOYMENT_OPERATIONS_RELEASE",
    deploymentEvidenceRequiredLater: [
      "Redmine/MCP deployment principal identity",
      "Agent Runner deployment principal identity",
      "credential source / principal identity / injection boundary",
    ],
  };
}

function verifyRunnerProductionBoundary({ runnerRoot, runnerRevision, run = defaultRun }) {
  const runtime = gitShow({
    repositoryRoot: runnerRoot,
    revision: runnerRevision,
    path: RUNNER_PRODUCTION_RUNTIME_PATH,
    run,
  });
  for (const phrase of [
    "createPhase49_5ProductionRuntime",
    "Phase49S3ArtifactPersistence",
    "createPhase48_6ProductionRuntime",
  ]) {
    if (!runtime.includes(phrase)) {
      fail(`Agent Runner production runtime evidence is missing ${phrase}`);
    }
  }

  const sandbox = gitShow({
    repositoryRoot: runnerRoot,
    revision: runnerRevision,
    path: RUNNER_SANDBOX_RUNTIME_PATH,
    run,
  });
  for (const phrase of [
    "REDMINE_WRITE_API_KEY",
    "CONTROL_PLANE_API_KEY",
    "AGENT_RUNNER_GIT_READ_TOKEN",
    "forbidden Controller credential environment exposed to Agent",
  ]) {
    if (!sandbox.includes(phrase)) {
      fail(`Agent Runner sandbox credential boundary evidence is missing ${phrase}`);
    }
  }

  const phase50Security = gitShow({
    repositoryRoot: runnerRoot,
    revision: runnerRevision,
    path: RUNNER_PHASE50_SECURITY_EVIDENCE_PATH,
    run,
  });
  for (const phrase of [
    "Sandbox credential and mount boundary",
    "REDMINE_WRITE_API_KEY",
    "CONTROL_PLANE_API_KEY",
    "Synthetic secret regression",
  ]) {
    if (!phase50Security.includes(phrase)) {
      fail(`Phase 50 security regression evidence is missing ${phrase}`);
    }
  }

  const packageJson = JSON.parse(gitShow({
    repositoryRoot: runnerRoot,
    revision: runnerRevision,
    path: RUNNER_PACKAGE_PATH,
    run,
  }));
  const hasStartScript = typeof packageJson.scripts?.start === "string";
  const hasPackageBin = packageJson.bin !== undefined;
  if (hasStartScript || hasPackageBin) {
    fail("Agent Runner exact RC unexpectedly exposes an executable package startup surface; deployment boundary requires review");
  }

  return {
    result: "PASS",
    exactSourceRevision: runnerRevision,
    productionRuntimeAssembly: {
      path: RUNNER_PRODUCTION_RUNTIME_PATH,
      createPhase49_5ProductionRuntime: "present",
      s3ArtifactPersistenceBinding: "present",
    },
    sandboxCredentialBoundary: {
      path: RUNNER_SANDBOX_RUNTIME_PATH,
      forbiddenControllerCredentialEnvironment: "enforced",
    },
    phase50SecurityRegression: {
      path: RUNNER_PHASE50_SECURITY_EVIDENCE_PATH,
      result: "PASS",
    },
    residentServiceStartupSurface: {
      packageStartScriptPresent: hasStartScript,
      packageBinPresent: hasPackageBin,
      acceptance: "DEFERRED_TO_DEPLOYMENT_OPERATIONS_RELEASE",
    },
  };
}

function buildDocumentationPreparation() {
  return {
    publicationState: "PREPARED_NOT_RELEASED",
    roadmap040: {
      dedicatedGceDeploymentAcceptance: "move with reason to later Deployment / Operations release",
      separateGceVmArchitectureBoundary: "unchanged",
      credentialBoundaryV040Scope: "design / implementation ownership and non-exposure separation",
      deploymentCredentialIdentitySeparation: "deferred",
      deploymentEnvironmentConformanceRerun: "required later on actual deployment host",
    },
    roadmap100Candidates: [
      "起動コードと専用 GCE への配置",
      "配置先での Redmine/MCP / Runner credential identity separation の確認",
    ],
    componentDocumentation: {
      requiredStatement: "current v0.4.0 RC has runtime composition / dependency assembly but is not a release that can be started as a resident production service as-is",
      redmineMcp: ["README", "CHANGELOG"],
      agentRunner: ["README", "CHANGELOG"],
    },
    finalGateOwnership: {
      releasedDeclaration: "Phase 52-4",
      canonicalPassRecord: "Phase 52-4",
      systemTagCreation: "Phase 52-4",
    },
  };
}

function buildCandidateCurrent({
  handoff,
  finalVerification,
  manifest,
  realS3Gate,
  environmentGate,
  phase51ReadOnlyRevalidation,
  phase51GatePolicyReferences,
  releaseFreezeVerification,
  processLaunchEvidence,
  credentialBoundaryEvidence,
  runnerProductionBoundaryEvidence,
  now = new Date(),
}) {
  const knownLimitations = [
    ...manifest.current.knownLimitations,
    "Agent Runner RC has runtime composition / production dependency assembly but no executable resident-service startup / supervision / deployment definition accepted in v0.4.0",
    "dedicated GCE production service deployment acceptance is deferred to a later Deployment / Operations release",
    "deployment-time Redmine/MCP vs Agent Runner credential identity separation is deferred and must be evidenced at the actual deployment boundary",
  ];
  const outOfScopeBoundary = [
    ...manifest.current.outOfScopeBoundary,
    "executable production Controller startup entry point / service supervision",
    "dedicated GCE deployment acceptance",
    "deployment credential / principal identity separation verification",
  ];

  return {
    systemMilestone: SYSTEM_MILESTONE,
    compatibleComponents: handoff.compatibleComponents,
    contractIdentities: handoff.contractIdentities,
    expectedHandoffProfile: manifest.current.expectedHandoffProfile,
    phase51FinalVerification: {
      path: PHASE51_FINAL_PATH,
      generation: finalVerification.generation,
      generationId: finalVerification.generationId,
      result: finalVerification.current.result,
    },
    releaseCompatibilityManifest: {
      path: MANIFEST_PATH,
      generation: manifest.generation,
      generationId: manifest.generationId,
      result: manifest.current.result,
    },
    phase51GatePolicyReferences,
    phase51ReadOnlyRevalidation,
    realPrivateS3Gate: realS3Gate,
    environmentConformanceGate: environmentGate,
    executionEnvironment: {
      realPrivateS3Gate: realS3Gate.executionHost,
      environmentConformanceGate: environmentGate.executionHost,
    },
    releaseFreezeVerification,
    productDeploymentBoundaryEvidence: {
      repositorySeparation: {
        redmineMcp: "mcp-mamono210/redmine",
        agentRunner: "mcp-mamono210/ai-agent-runner",
        result: "PASS",
      },
      processLaunchEvidence,
      credentialBoundaryEvidence,
      runnerProductionBoundaryEvidence,
      dedicatedGceDeploymentAcceptance: "DEFERRED",
      gceVerificationIsProductionDeploymentCertification: false,
    },
    documentationPreparation: buildDocumentationPreparation(),
    knownLimitations,
    outOfScopeBoundary,
    systemTagPolicy: {
      tag: "system-v0.4.0",
      repository: "mcp-mamono210/redmine",
      creationPhase: "52-4",
      targetRule: "must point to the exact commit containing the canonical PASS v0.4.0-system-release record",
      redmineMcpComponentTag: "v0.3.0 unchanged",
      agentRunnerSystemMilestoneTag: "must not be created",
    },
    result: "PASS",
    verifiedAt: now.toISOString(),
  };
}

function assertSingleResultField(record) {
  const serialized = JSON.stringify(record.current);
  if (/"releaseResult"\s*:/u.test(serialized)) fail("system release record must not contain releaseResult");
  if (record.current.result !== "PASS" && record.current.result !== "FAIL") {
    fail("system release record current.result must be PASS or FAIL");
  }
}

function runSelfTest() {
  const handoffText = [
    "System milestone: **v0.4.0**",
    "- Redmine MCP: version `0.3.0`, exact source `" + "a".repeat(40) + "`",
    "- Agent Runner: version `0.0.0`, exact source `" + "b".repeat(40) + "`",
    "| Contract | semanticRevision | sourceRevision | sourceBlobSha |",
    "| --- | ---: | --- | --- |",
    `| agent-runner-security-sandbox | 1 | \`${"c".repeat(40)}\` | \`${"d".repeat(40)}\` |`,
    "Canonical expected handoff profile: `docs/contracts/system-release-handoff-profile.json` (schemaVersion=1, profileId=ready-for-agent-handoff-v1)",
    "### real-private-s3-system-release-gate",
    "- Evidence location: `docs/verification/phase50-real-infrastructure-policy.json`",
    "### sandbox-environment-conformance-system-release-gate",
    "- Evidence location: `docs/verification/phase50-real-infrastructure-policy.json`",
  ].join("\n");
  const handoff = parseHandoff(handoffText);
  if (handoff.compatibleComponents.agentRunner.exactSourceRevision !== "b".repeat(40)) {
    fail("self-test: handoff component parsing failed");
  }

  const processText = `import { execFile } from "node:child_process";\nexecFile(\n  "git",\n  ["status"],\n  () => undefined,\n);\n`;
  const sites = scanProcessLaunchSitesInText("src/agent-brief/persistence.ts", processText);
  if (sites.length !== 1 || !sites[0].allowedGitPersistence || sites[0].launchedExecutable !== "git") {
    fail("self-test: canonical Git process launch was not classified correctly");
  }
  const unsafe = scanProcessLaunchSitesInText(
    "src/index.ts",
    `import { spawn } from "node:child_process";\nspawn("agent-runner", []);\n`,
  );
  if (unsafe.length !== 1 || unsafe[0].allowedGitPersistence) {
    fail("self-test: noncanonical process launch was not detected");
  }

  const prospective = makeInitialEvidenceRecord(SYSTEM_RECORD_TYPE, {
    systemMilestone: SYSTEM_MILESTONE,
    phase51GatePolicyReferences: handoff.phase51GatePolicyReferences,
    processLaunchSites: sites.map(({ allowedGitPersistence, ...site }) => site),
    result: "PASS",
    verifiedAt: "2026-09-25T00:00:00Z",
  });
  assertSingleResultField(prospective);

  return {
    result: "PASS",
    handoffParsing: "PASS",
    policyReferenceInterpretation: "PASS",
    canonicalGitProcessClassification: "PASS",
    noncanonicalProcessDetection: "PASS",
    singleResultField: "PASS",
    dryRunOnlyBoundary: "PASS",
  };
}

function main(options) {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }

  const handoff = parseHandoff(readText(options.root, HANDOFF_PATH));
  const finalVerification = readJson(resolve(options.root, PHASE51_FINAL_PATH));
  const manifest = readJson(resolve(options.root, MANIFEST_PATH));
  const schema = readPhase52Schema(options.root);
  const realS3Record = readJson(resolve(options.root, REAL_S3_GATE_PATH));
  const environmentRecord = readJson(resolve(options.root, ENVIRONMENT_GATE_PATH));
  const registry = readJson(resolve(options.root, REGISTRY_PATH));

  assertPhase51InputClosure({ handoff, finalVerification, manifest });

  const phase51ReadOnlyRevalidation = runPhase51ReadOnlyRevalidation({
    root: options.root,
    runnerRcRoot: options.runnerRcRoot,
  });

  const realS3Gate = validateGateEvidence({
    gate: realS3Record,
    expectedRecordType: "phase52-real-s3-system-release-gate",
    expectedTestedSourceRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
    runnerRoot: options.runnerRoot,
    runnerMain: options.runnerMain,
    schema,
  });
  const environmentGate = validateGateEvidence({
    gate: environmentRecord,
    expectedRecordType: "phase52-environment-conformance-system-release-gate",
    expectedTestedSourceRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
    runnerRoot: options.runnerRoot,
    runnerMain: options.runnerMain,
    schema,
  });

  const phase51GatePolicyReferences = verifyGatePolicyReferences({
    references: handoff.phase51GatePolicyReferences,
    runnerRoot: options.runnerRoot,
    runnerRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
  });

  const releaseFreezeVerification = verifyReleaseFreeze({
    root: options.root,
    runnerRoot: options.runnerRoot,
    handoff,
    redmineMain: options.redmineMain,
    runnerMain: options.runnerMain,
  });
  const processLaunchEvidence = scanRedmineProcessLaunchSites({
    root: options.root,
    revision: handoff.compatibleComponents.redmineMcp.exactSourceRevision,
  });
  const credentialBoundaryEvidence = verifyCredentialBoundary({
    root: options.root,
    runnerRoot: options.runnerRoot,
    handoff,
    manifest,
    registry,
  });
  const runnerProductionBoundaryEvidence = verifyRunnerProductionBoundary({
    runnerRoot: options.runnerRoot,
    runnerRevision: handoff.compatibleComponents.agentRunner.exactSourceRevision,
  });

  const current = buildCandidateCurrent({
    handoff,
    finalVerification,
    manifest,
    realS3Gate,
    environmentGate,
    phase51ReadOnlyRevalidation,
    phase51GatePolicyReferences,
    releaseFreezeVerification,
    processLaunchEvidence,
    credentialBoundaryEvidence,
    runnerProductionBoundaryEvidence,
  });
  const candidateRecord = makeInitialEvidenceRecord(SYSTEM_RECORD_TYPE, current);
  assertSingleResultField(candidateRecord);
  validateEvidenceAgainstSchema(candidateRecord, schema);

  process.stdout.write(`${JSON.stringify({
    mode: "dry-run",
    validation: "PASS",
    canonicalRecordWritten: false,
    phase51ReadOnlyRevalidation,
    candidateRecord,
  }, null, 2)}\n`);
}

const options = parseArgs(process.argv.slice(2));
try {
  main(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
