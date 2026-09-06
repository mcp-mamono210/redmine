#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { planCiPipeline } from "../../dist/src/ci/pipeline-routing.js";

const OUTPUT_PATH = process.argv[2];
if (!OUTPUT_PATH) {
  throw new Error("Output path is required");
}

const allowedContexts = new Set(["normal", "release_candidate", "release"]);
const requestedContext = process.env.CI_REQUESTED_EXECUTION_CONTEXT || "normal";
if (!allowedContexts.has(requestedContext)) {
  throw new Error(`Invalid CI execution context: ${requestedContext}`);
}

const requestedReproducibility =
  (process.env.CI_REQUESTED_REPRODUCIBILITY || "false") === "true";
const tag = process.env.CIRCLE_TAG || "";
const branch = process.env.CIRCLE_BRANCH || "";
const baseRevision = process.env.CI_BASE_REVISION || "main";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalChangedPaths() {
  if (tag) {
    return [];
  }

  if (branch === baseRevision) {
    try {
      return git(["diff", "--name-only", "HEAD^", "HEAD"])
        .split("\n")
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    git(["fetch", "origin", baseRevision, "--depth=100"]);
    const mergeBase = git(["merge-base", "HEAD", `origin/${baseRevision}`]);
    return git(["diff", "--name-only", mergeBase, "HEAD"])
      .split("\n")
      .filter(Boolean);
  } catch {
    // Empty input intentionally fails safe in classifyChangedPaths().
    return [];
  }
}

const changedPaths =
  requestedContext === "normal" && !tag ? normalChangedPaths() : [];

const plan = planCiPipeline(changedPaths, {
  requestedExecutionContext: requestedContext,
  tag,
  runReproducibility: requestedReproducibility,
});

const parameters = {
  run_static: plan.runStatic,
  run_unit: plan.runUnit,
  run_integration: plan.runIntegration,
  run_e2e: plan.runE2e,
  run_context_budget: plan.runContextBudget,
  run_docs_only: plan.runDocsOnly,
  run_manual_reproducibility: plan.runManualReproducibility,
  run_full_release_gate: plan.runFullReleaseGate,
};

console.log(
  JSON.stringify(
    {
      resolved_execution_context: plan.resolvedExecutionContext,
      changed_paths: changedPaths,
      required_verification_domains:
        plan.classification.requiredVerificationDomains,
      fail_safe_applied: plan.classification.failSafeApplied,
      continuation_parameters: parameters,
    },
    null,
    2,
  ),
);

writeFileSync(
  resolve(OUTPUT_PATH),
  `${JSON.stringify(parameters, null, 2)}\n`,
  "utf8",
);
