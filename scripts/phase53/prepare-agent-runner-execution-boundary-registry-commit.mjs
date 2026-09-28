#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTRACT_ID = "agent-runner-execution-boundary";
const CONTRACT_PATH = "docs/contracts/agent-runner-execution-boundary-contract.md";
const REGISTRY_PATH = "docs/contracts/system-release-compatibility-contract-registry.json";
const EXPECTED_PREVIOUS_SEMANTIC_REVISION = 1;
const TARGET_SEMANTIC_REVISION = 2;

const root = resolve(process.argv[3] ?? process.cwd());
const requestedRevision = process.argv[2] ?? git(root, ["rev-parse", "HEAD"]);
if (!/^[0-9a-f]{40}$/u.test(requestedRevision)) {
  fail("Usage: node scripts/phase53/prepare-agent-runner-execution-boundary-registry-commit.mjs [40-hex-commit-a] [repo-root]");
}

const head = git(root, ["rev-parse", "HEAD"]);
if (head !== requestedRevision) {
  fail(`Commit B preparation requires HEAD == Commit A: HEAD=${head}, commitA=${requestedRevision}`);
}

const statusBefore = git(root, ["status", "--porcelain", "--untracked-files=no"]);
if (statusBefore !== "") {
  fail("Commit B preparation requires no tracked worktree/index changes immediately after Commit A");
}

const registryFile = resolve(root, REGISTRY_PATH);
const registry = JSON.parse(readFileSync(registryFile, "utf8"));
const entry = registry.contracts?.find((candidate) => candidate.contractId === CONTRACT_ID);
if (!entry) fail(`${CONTRACT_ID} registry entry is missing`);
if (entry.path !== CONTRACT_PATH) fail(`${CONTRACT_ID} contract path drifted`);
if (entry.repository !== "mcp-mamono210/redmine") fail(`${CONTRACT_ID} repository drifted`);
if (entry.semanticRevision !== EXPECTED_PREVIOUS_SEMANTIC_REVISION) {
  fail(`Commit A must leave registry semanticRevision=${EXPECTED_PREVIOUS_SEMANTIC_REVISION}`);
}
if (entry.registrationState !== "committed") {
  fail("Commit A must leave the existing registry entry committed and unchanged");
}

const contractBytes = gitBuffer(root, ["show", `${requestedRevision}:${CONTRACT_PATH}`]);
const contractBlob = gitBlobSha(contractBytes);
const workingBytes = readFileSync(resolve(root, CONTRACT_PATH));
if (!workingBytes.equals(contractBytes)) {
  fail("working-tree contract bytes differ from Commit A");
}

entry.semanticRevision = TARGET_SEMANTIC_REVISION;
entry.sourceRevision = requestedRevision;
entry.sourceBlobSha = contractBlob;
entry.registrationState = "committed";

writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

const changed = git(root, ["diff", "--name-only"]).split("\n").filter(Boolean);
if (changed.length !== 1 || changed[0] !== REGISTRY_PATH) {
  fail(`Commit B preparation must change only ${REGISTRY_PATH}; changed=${changed.join(",")}`);
}

process.stdout.write([
  "Phase 53-3 Commit B registry preparation PASS",
  `contractId=${CONTRACT_ID}`,
  `semanticRevision=${TARGET_SEMANTIC_REVISION}`,
  `sourceRevision=${requestedRevision}`,
  `sourceBlobSha=${contractBlob}`,
  `changedFile=${REGISTRY_PATH}`,
].join("\n") + "\n");

function git(rootDir, args) {
  return execFileSync("git", ["-C", rootDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitBuffer(rootDir, args) {
  return execFileSync("git", ["-C", rootDir, ...args], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function fail(message) {
  throw new Error(message);
}
