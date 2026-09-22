#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const revision = process.argv[2];
const root = resolve(process.argv[3] ?? process.cwd());
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error("Usage: node scripts/phase51/finalize-contract-registry.mjs <40-hex-contract-commit> [repo-root]");
}

const registryPath = resolve(root, "docs/contracts/system-release-compatibility-contract-registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const entry = registry.contracts.find((candidate) => candidate.contractId === "system-release-compatibility");
if (!entry) throw new Error("system-release-compatibility registry entry is missing");

const bytes = execFileSync("git", ["-C", root, "show", `${revision}:${entry.path}`], { encoding: null });
const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
const actualBlobSha = createHash("sha1").update(header).update(bytes).digest("hex");
if (actualBlobSha !== entry.sourceBlobSha) {
  throw new Error(`Contract blob mismatch at ${revision}: expected ${entry.sourceBlobSha}, got ${actualBlobSha}`);
}

entry.sourceRevision = revision;
entry.registrationState = "committed";
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
process.stdout.write(`Finalized system-release-compatibility sourceRevision=${revision}\n`);
