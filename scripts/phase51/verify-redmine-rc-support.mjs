#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSchema } from "./validate-system-release-compatibility.mjs";
import { deriveRedmineProducerProfile } from "./redmine-producer-profile.mjs";
import { captureRedmineDurableHandoff } from "./redmine-durable-handoff-probe.mjs";
import { calculateProductionFingerprint } from "./redmine-requirements-fingerprint-probe.mjs";

function fail(message) {
  throw new Error(message);
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], {
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitBlobSha(root, path) {
  return git(root, ["hash-object", path]).trim();
}

function assertBuildExists(root) {
  const required = [
    "dist/src/agent-brief/lifecycle-metadata.js",
    "dist/src/redmine/issue-custom-field-writer.js",
    "dist/src/agent-brief/requirements-fingerprint.js",
  ];
  for (const path of required) {
    if (!existsSync(resolve(root, path))) {
      fail(`Missing ${path}; run npm run build before Phase 51-2 support verification`);
    }
  }
}

function deterministicHandoffFixture() {
  return {
    issueId: 5102,
    repository: "mcp-mamono210/redmine",
    approverIdentity: "redmine-user:3",
    approvedAt: "2026-09-22T00:00:00Z",
    briefRevision: 1,
    persistedRevision: "phase51-redmine-persisted-revision",
    requirementsFingerprint: `sha256:${"b".repeat(64)}`,
  };
}

function deterministicGenerationInput() {
  return {
    format_version: 1,
    source: {
      redmine_issue_id: 5102,
      source_updated_on: "2026-09-22T00:00:00Z",
      project: { id: 414, name: "Redmine" },
      tracker: { id: 2, name: "Feature" },
      subject: "Phase 51 deterministic fingerprint fixture",
      description: "Cross-component compatibility fixture for the Redmine producer.",
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

function assertDocumentationReadiness(root) {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");

  if (!readme.includes(`Current package version: \`${pkg.version}\``)) {
    fail("README package version is not aligned with package.json");
  }
  if (!readme.includes(`Current release: v${pkg.version}.`)) {
    fail("README current release is not aligned with package.json");
  }
  if (!readme.includes("is not an Agent execution Tool")) {
    fail("README no longer preserves the Redmine MCP / Agent execution responsibility boundary");
  }
  if (!readme.includes("future Agent execution layer")) {
    fail("README no longer points Agent execution to the later execution layer");
  }
  if (!changelog.includes(`## [${pkg.version}]`)) {
    fail("CHANGELOG does not contain the current released component version");
  }
  if (!changelog.includes("## [Unreleased]")) {
    fail("CHANGELOG has no Unreleased section");
  }

  return {
    packageVersion: pkg.version,
    readme: "PASS",
    changelog: "PASS",
    responsibilityBoundary: "PASS",
  };
}

export async function verifyRedmineRcSupport(root) {
  assertBuildExists(root);

  const canonicalProfile = JSON.parse(
    readFileSync(resolve(root, "docs/contracts/system-release-handoff-profile.json"), "utf8"),
  );
  const profileSchema = JSON.parse(
    readFileSync(resolve(root, "docs/contracts/system-release-handoff-profile.schema.json"), "utf8"),
  );

  const producer = await deriveRedmineProducerProfile(root);
  validateSchema(producer.handoffSemanticProfile, profileSchema);
  if (JSON.stringify(producer.handoffSemanticProfile) !== JSON.stringify(canonicalProfile)) {
    fail("Redmine producer semantic profile does not equal the canonical handoff profile");
  }

  const handoffFixture = deterministicHandoffFixture();
  const durable = await captureRedmineDurableHandoff(root, handoffFixture);
  const expectedIdentity = {
    repository: handoffFixture.repository,
    redmine_issue_id: handoffFixture.issueId,
    brief_revision: handoffFixture.briefRevision,
    persisted_revision: handoffFixture.persistedRevision,
    requirements_fingerprint: handoffFixture.requirementsFingerprint,
    approver_identity: handoffFixture.approverIdentity,
    approved_at: handoffFixture.approvedAt,
  };
  if (JSON.stringify(durable.handoffIdentity) !== JSON.stringify(expectedIdentity)) {
    fail("Production durable handoff representation drifted from the deterministic expected identity");
  }

  const fingerprintInput = deterministicGenerationInput();
  const firstFingerprint = await calculateProductionFingerprint(root, fingerprintInput);
  const secondFingerprint = await calculateProductionFingerprint(root, fingerprintInput);
  if (firstFingerprint.requirementsFingerprint !== secondFingerprint.requirementsFingerprint) {
    fail("Production requirements fingerprint probe is not deterministic");
  }

  const documentation = assertDocumentationReadiness(root);
  const requirementsFingerprintImplementationSources = [
    {
      repository: "mcp-mamono210/redmine",
      path: "src/agent-brief/generation-input.ts",
      blobSha: gitBlobSha(root, "src/agent-brief/generation-input.ts"),
    },
    {
      repository: "mcp-mamono210/redmine",
      path: "src/agent-brief/requirements-fingerprint.ts",
      blobSha: gitBlobSha(root, "src/agent-brief/requirements-fingerprint.ts"),
    },
  ];

  return {
    result: "PASS",
    handoffProducerProfile: producer.handoffSemanticProfile,
    constraintConformance: producer.constraintConformance,
    durableRepresentationProbe: {
      result: "PASS",
      productionBindings: durable.productionBindings,
    },
    requirementsFingerprintProbe: {
      result: "PASS",
      deterministicFingerprint: firstFingerprint.requirementsFingerprint,
      productionBinding: firstFingerprint.productionBinding,
    },
    requirementsFingerprintImplementationSources,
    documentationReadiness: documentation,
  };
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

const invokedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (invokedPath) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await verifyRedmineRcSupport(options.root);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
