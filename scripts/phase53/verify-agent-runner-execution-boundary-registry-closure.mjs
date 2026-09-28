#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const CONTRACT_ID = "agent-runner-execution-boundary";
const CONTRACT_PATH = "docs/contracts/agent-runner-execution-boundary-contract.md";
const REGISTRY_PATH = "docs/contracts/system-release-compatibility-contract-registry.json";
const STRICT_VALIDATOR = "scripts/phase51/validate-system-release-compatibility.mjs";
const EXPECTED_SEMANTIC_REVISION = 2;

const options = parseArgs(process.argv.slice(2));
const root = resolve(options.root);
const head = git(root, ["rev-parse", "HEAD"]);

assertTrackedFilesMatchHead(root, [CONTRACT_PATH, REGISTRY_PATH]);
const registry = JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), "utf8"));
const closure = verifyClosure({ root, head, registry });
const strictOutput = runStrictValidator(root);
let negativeControl = null;
if (options.negativeControls) {
  negativeControl = runCommitAOmissionNegativeControl({ root, head, sourceRevision: closure.sourceRevision });
}

const evidence = {
  schemaVersion: 1,
  recordType: "phase53-3-agent-runner-execution-boundary-registry-closure",
  mode: options.mode,
  verifiedAt: new Date().toISOString(),
  contractId: CONTRACT_ID,
  semanticRevision: EXPECTED_SEMANTIC_REVISION,
  headSha: head,
  commitASha: closure.sourceRevision,
  registrySourceBlobSha: closure.registrySourceBlobSha,
  headContractBlobSha: closure.headContractBlobSha,
  commitAContractBlobSha: closure.sourceContractBlobSha,
  threeWayBlobEquality: true,
  commitAReachableFromHead: true,
  strictValidation: {
    result: "PASS",
    command: "node scripts/phase51/validate-system-release-compatibility.mjs --mode strict --negative-controls",
    output: strictOutput.trim(),
  },
  commitAOmissionNegativeControl: negativeControl,
};

if (options.evidenceOut !== null) {
  const target = resolve(root, options.evidenceOut);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

process.stdout.write([
  "Phase 53-3 execution-boundary registry closure PASS",
  `mode=${options.mode}`,
  `headSha=${head}`,
  `commitASha=${closure.sourceRevision}`,
  `blobSha=${closure.registrySourceBlobSha}`,
  `negativeControls=${options.negativeControls ? "PASS" : "not-run"}`,
  ...(options.evidenceOut === null ? [] : [`evidenceOut=${options.evidenceOut}`]),
].join("\n") + "\n");

function verifyClosure({ root: rootDir, head: headRevision, registry: registryValue }) {
  const entry = registryValue.contracts?.find((candidate) => candidate.contractId === CONTRACT_ID);
  if (!entry) fail(`${CONTRACT_ID} registry entry is missing`);
  if (entry.repository !== "mcp-mamono210/redmine") fail(`${CONTRACT_ID} repository drifted`);
  if (entry.path !== CONTRACT_PATH) fail(`${CONTRACT_ID} path drifted`);
  if (entry.semanticRevision !== EXPECTED_SEMANTIC_REVISION) {
    fail(`${CONTRACT_ID} semanticRevision must be ${EXPECTED_SEMANTIC_REVISION}`);
  }
  if (entry.registrationState !== "committed") fail(`${CONTRACT_ID} must be committed`);
  if (!/^[0-9a-f]{40}$/u.test(entry.sourceRevision ?? "")) fail(`${CONTRACT_ID} sourceRevision is invalid`);
  if (!/^[0-9a-f]{40}$/u.test(entry.sourceBlobSha ?? "")) fail(`${CONTRACT_ID} sourceBlobSha is invalid`);

  assertAncestor(rootDir, entry.sourceRevision, headRevision);
  const headBytes = gitBuffer(rootDir, ["show", `${headRevision}:${CONTRACT_PATH}`]);
  const sourceBytes = gitBuffer(rootDir, ["show", `${entry.sourceRevision}:${CONTRACT_PATH}`]);
  const headBlob = gitBlobSha(headBytes);
  const sourceBlob = gitBlobSha(sourceBytes);

  if (headBlob !== entry.sourceBlobSha || sourceBlob !== entry.sourceBlobSha) {
    fail([
      "Phase 53-3 three-way blob closure failed",
      `registry=${entry.sourceBlobSha}`,
      `head=${headBlob}`,
      `sourceRevision=${sourceBlob}`,
    ].join("; "));
  }

  return {
    sourceRevision: entry.sourceRevision,
    registrySourceBlobSha: entry.sourceBlobSha,
    headContractBlobSha: headBlob,
    sourceContractBlobSha: sourceBlob,
  };
}

function runCommitAOmissionNegativeControl({ root: rootDir, head: headRevision, sourceRevision }) {
  const staleRegistryBytes = gitBuffer(rootDir, ["show", `${sourceRevision}:${REGISTRY_PATH}`]);
  const staleRegistry = JSON.parse(staleRegistryBytes.toString("utf8"));
  let failed = false;
  let diagnostic = "";
  try {
    verifyClosure({ root: rootDir, head: headRevision, registry: staleRegistry });
  } catch (error) {
    failed = true;
    diagnostic = error instanceof Error ? error.message : String(error);
  }
  if (!failed) {
    fail("negative control unexpectedly passed: Commit A contract bytes with the stale registry were accepted");
  }
  return {
    result: "PASS",
    fixture: "registry bytes at Commit A before Commit B",
    detectedMismatch: diagnostic,
  };
}

function runStrictValidator(rootDir) {
  try {
    return execFileSync(process.execPath, [
      resolve(rootDir, STRICT_VALIDATOR),
      "--root",
      rootDir,
      "--mode",
      "strict",
      "--negative-controls",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr ?? "")
      : "";
    fail(`Phase 51 strict validator failed${stderr === "" ? "" : `: ${stderr.trim()}`}`);
  }
}

function assertTrackedFilesMatchHead(rootDir, paths) {
  for (const path of paths) {
    try {
      execFileSync("git", ["-C", rootDir, "diff", "--quiet", "HEAD", "--", path], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      fail(`tracked file differs from exact HEAD: ${path}`);
    }
  }
}

function assertAncestor(rootDir, ancestor, descendant) {
  try {
    execFileSync("git", ["-C", rootDir, "merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch {
    fail(`Commit A is not reachable from HEAD: ${ancestor}`);
  }
}

function parseArgs(argv) {
  const output = { root: process.cwd(), mode: "pre-merge", negativeControls: false, evidenceOut: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") output.root = argv[++index];
    else if (arg === "--mode") output.mode = argv[++index];
    else if (arg === "--negative-controls") output.negativeControls = true;
    else if (arg === "--evidence-out") output.evidenceOut = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  if (!["pre-merge", "post-merge"].includes(output.mode)) fail(`Unknown mode: ${output.mode}`);
  if (typeof output.root !== "string" || output.root === "") fail("--root requires a path");
  if (output.evidenceOut !== null && (typeof output.evidenceOut !== "string" || output.evidenceOut === "")) {
    fail("--evidence-out requires a path");
  }
  return output;
}

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
