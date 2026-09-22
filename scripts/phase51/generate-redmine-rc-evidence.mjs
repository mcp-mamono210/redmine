#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSchema } from "./validate-system-release-compatibility.mjs";
import { verifyRedmineRcSupport } from "./verify-redmine-rc-support.mjs";

const REPOSITORY = "mcp-mamono210/redmine";
const IDENTITY_PATH = "docs/verification/phase51-redmine-mcp-rc-identity.json";
const VERIFICATION_PATH = "docs/verification/phase51-redmine-mcp-rc-verification.json";

function fail(message) {
  throw new Error(message);
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], {
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitText(root, args) {
  return git(root, args).trim();
}

function gitShowText(root, revision, path) {
  return git(root, ["show", `${revision}:${path}`]);
}

function gitBlobAt(root, revision, path) {
  return gitText(root, ["rev-parse", `${revision}:${path}`]);
}

function assertRevision(root, revision) {
  if (!/^[0-9a-f]{40}$/u.test(revision)) fail(`Expected exact 40-hex source revision, got ${revision}`);
  gitText(root, ["cat-file", "-e", `${revision}^{commit}`]);
}

function generationId(recordType, generation, current) {
  const canonical = JSON.stringify({ recordType, generation, current });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function evidenceEnvelope(recordType, current) {
  const generation = 1;
  return {
    schemaVersion: 1,
    recordType,
    generation,
    generationId: generationId(recordType, generation, current),
    current,
    history: [],
    supersedes: null,
  };
}

function writeEvidence(root, relativePath, record) {
  const schema = JSON.parse(
    readFileSync(resolve(root, "docs/contracts/system-release-compatibility-evidence.schema.json"), "utf8"),
  );
  validateSchema(record, schema);
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function changedPaths(root, fromRevision, toRevision) {
  const output = gitText(root, ["diff", "--name-only", `${fromRevision}..${toRevision}`]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function classifyChanges(paths) {
  const runtime = paths.filter((path) =>
    path.startsWith("src/") ||
    path === "package.json" ||
    path === "package-lock.json" ||
    path === ".nvmrc" ||
    path === "tsconfig.json"
  );

  const publicContracts = new Set([
    "docs/contracts/agent-brief-release-handoff-contract.md",
    "docs/contracts/agent-brief-lifecycle-contract.md",
    "docs/contracts/agent-brief-redmine-mapping-contract.md",
    "docs/contracts/agent-brief-requirements-fingerprint-contract.md",
    "docs/contracts/agent-brief-public-mcp-surface-contract.md",
  ]);
  const publicContract = paths.filter((path) => publicContracts.has(path));

  return { runtime, publicContract };
}

function requiredContractIdentities(root, sourceRevision) {
  const registry = JSON.parse(
    gitShowText(root, sourceRevision, "docs/contracts/system-release-compatibility-contract-registry.json"),
  );
  const required = registry.contracts.filter((entry) => entry.normative === true);
  for (const entry of required) {
    if (entry.registrationState !== "committed") {
      fail(`Required contract is not committed: ${entry.contractId}`);
    }
  }
  return required.map((entry) => ({
    contractId: entry.contractId,
    repository: entry.repository,
    path: entry.path,
    semanticRevision: entry.semanticRevision,
    sourceRevision: entry.sourceRevision,
    sourceBlobSha: entry.sourceBlobSha,
  }));
}

function sourceIdentity(root, sourceRevision, path) {
  return {
    repository: REPOSITORY,
    sourceRevision,
    path,
    blobSha: gitBlobAt(root, sourceRevision, path),
  };
}

function resolveReleasedIdentity(root, releasedTag) {
  const sourceRevision = gitText(root, ["rev-parse", `${releasedTag}^{commit}`]);
  const pkg = JSON.parse(gitShowText(root, sourceRevision, "package.json"));
  return {
    tag: releasedTag,
    componentVersion: pkg.version,
    sourceRevision,
  };
}

function buildIdentity(root, sourceRevision, releasedTag) {
  assertRevision(root, sourceRevision);
  const latestReleasedIdentity = resolveReleasedIdentity(root, releasedTag);
  const candidatePackage = JSON.parse(gitShowText(root, sourceRevision, "package.json"));
  const paths = changedPaths(root, latestReleasedIdentity.sourceRevision, sourceRevision);
  const classified = classifyChanges(paths);

  const runtimeChanged = classified.runtime.length !== 0;
  const publicContractChanged = classified.publicContract.length !== 0;
  const versionReuseAllowed = !runtimeChanged && !publicContractChanged;

  if (!versionReuseAllowed && candidatePackage.version === latestReleasedIdentity.componentVersion) {
    fail("Candidate reuses the released component version even though runtime/public component contract changed");
  }

  const decision = versionReuseAllowed && candidatePackage.version === latestReleasedIdentity.componentVersion
    ? "REUSE_RELEASED_VERSION"
    : "USE_CANDIDATE_VERSION";

  const current = {
    componentVersion: candidatePackage.version,
    exactSourceRevision: sourceRevision,
    latestReleasedIdentity,
    runtimeArtifactComparison: {
      baselineRevision: latestReleasedIdentity.sourceRevision,
      result: runtimeChanged ? "CHANGED" : "UNCHANGED",
      changedPaths: classified.runtime,
    },
    publicContractComparison: {
      baselineRevision: latestReleasedIdentity.sourceRevision,
      result: publicContractChanged ? "CHANGED" : "UNCHANGED",
      changedPaths: classified.publicContract,
    },
    versionDecision: decision,
    decisionRationale: versionReuseAllowed
      ? "No runtime artifact or Redmine MCP externally observable component contract changed relative to the latest released component identity; Phase 51 changes are documentation, architecture/CI, tests, or verification support."
      : "The candidate contains a runtime artifact and/or externally observable component-contract change, so released-version reuse is prohibited.",
    requiredContractIdentities: requiredContractIdentities(root, sourceRevision),
  };

  return evidenceEnvelope("redmine-mcp-rc-identity", current);
}

async function buildVerification(root, options) {
  assertRevision(root, options.sourceRevision);
  const head = gitText(root, ["rev-parse", "HEAD"]);
  if (head !== options.sourceRevision) {
    fail(`Verification must execute from the exact RC checkout; HEAD=${head}, expected ${options.sourceRevision}`);
  }

  const identity = JSON.parse(readFileSync(resolve(root, IDENTITY_PATH), "utf8"));
  if (identity.current?.exactSourceRevision !== options.sourceRevision) {
    fail("RC identity evidence does not reference the requested exact source revision");
  }

  const support = await verifyRedmineRcSupport(root);
  if (support.result !== "PASS") fail("Verification-support check did not PASS");

  const packageJson = JSON.parse(gitShowText(root, options.sourceRevision, "package.json"));
  const implementationSources = [
    sourceIdentity(root, options.sourceRevision, "src/agent-brief/generation-input.ts"),
    sourceIdentity(root, options.sourceRevision, "src/agent-brief/requirements-fingerprint.ts"),
  ];

  const current = {
    componentVersion: packageJson.version,
    exactSourceRevision: options.sourceRevision,
    gateIdentity: {
      repository: REPOSITORY,
      sourceRevision: options.sourceRevision,
      routingConfigPath: ".circleci/config.yml",
      continuationConfigPath: ".circleci/continue_config.yml",
      contractPath: "docs/contracts/ci-release-gate-contract.md",
      executionContext: "release_candidate",
      terminalJob: "release_gate",
    },
    result: options.gateResult,
    handoffProducerProfile: support.handoffProducerProfile,
    constraintConformance: support.constraintConformance,
    requirementsFingerprintImplementationSources: implementationSources,
    probeBindings: {
      producerProfileProbe: "scripts/phase51/redmine-producer-profile.mjs",
      durableHandoffRepresentationProbe: "scripts/phase51/redmine-durable-handoff-probe.mjs",
      requirementsFingerprintCanonicalProbe: "scripts/phase51/redmine-requirements-fingerprint-probe.mjs",
    },
    rawEvidence: {
      repository: REPOSITORY,
      sourceRevision: options.sourceRevision,
      executionReference: options.rawEvidenceRef,
    },
    executedAt: options.executedAt,
  };

  return evidenceEnvelope("redmine-mcp-rc-verification", current);
}

function parseArgs(argv) {
  if (argv.length === 0) fail("Expected subcommand: identity or verification");
  const command = argv[0];
  const options = {
    command,
    root: process.cwd(),
    sourceRevision: null,
    releasedTag: "v0.3.0",
    gateResult: null,
    rawEvidenceRef: null,
    executedAt: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--source-revision") options.sourceRevision = argv[++index];
    else if (arg === "--released-tag") options.releasedTag = argv[++index];
    else if (arg === "--gate-result") options.gateResult = argv[++index];
    else if (arg === "--raw-evidence-ref") options.rawEvidenceRef = argv[++index];
    else if (arg === "--executed-at") options.executedAt = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.sourceRevision) options.sourceRevision = gitText(options.root, ["rev-parse", "HEAD"]);
  return options;
}

const invokedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (invokedPath) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === "identity") {
      const record = buildIdentity(options.root, options.sourceRevision, options.releasedTag);
      writeEvidence(options.root, IDENTITY_PATH, record);
      process.stdout.write(`Wrote ${IDENTITY_PATH} for ${options.sourceRevision}\n`);
    } else if (options.command === "verification") {
      if (!["PASS", "FAIL"].includes(options.gateResult)) fail("--gate-result must be PASS or FAIL");
      if (!options.rawEvidenceRef) fail("--raw-evidence-ref is required");
      if (!options.executedAt || Number.isNaN(Date.parse(options.executedAt))) fail("--executed-at must be an RFC3339 timestamp");
      const record = await buildVerification(options.root, options);
      writeEvidence(options.root, VERIFICATION_PATH, record);
      process.stdout.write(`Wrote ${VERIFICATION_PATH} for ${options.sourceRevision}\n`);
    } else {
      fail(`Unknown subcommand: ${options.command}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
