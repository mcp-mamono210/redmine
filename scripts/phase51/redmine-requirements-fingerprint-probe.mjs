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

export async function calculateProductionFingerprint(root, generationInput) {
  const module = await import(
    pathToFileURL(resolve(root, "dist/src/agent-brief/requirements-fingerprint.js")).href
  );
  const requirementsFingerprint = module.calculateAgentBriefRequirementsFingerprint(generationInput);
  if (!/^sha256:[0-9a-f]{64}$/u.test(requirementsFingerprint)) {
    fail("Production fingerprint output is not canonical sha256 lowercase-hex");
  }
  return {
    requirementsFingerprint,
    inputFormatVersion: module.AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION,
    productionBinding: "src/agent-brief/requirements-fingerprint.ts#calculateAgentBriefRequirementsFingerprint",
  };
}

if (process.argv[1]?.endsWith("redmine-requirements-fingerprint-probe.mjs")) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const input = readInput(options.input);
    const result = await calculateProductionFingerprint(options.root, input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
