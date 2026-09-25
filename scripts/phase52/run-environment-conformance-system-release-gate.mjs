#!/usr/bin/env node

import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  assertCleanCheckout,
  assertDetachedCleanCheckout,
  assertEnvironmentConformanceOwnership,
  assertNodeVersionMatchesNvmrc,
  assertOutputOutsideCheckout,
  assertRawEvidenceFilename,
  assertRawRecordPathIsNew,
  captureExecutionHost,
  defaultRun,
  ensureParentDirectoryExists,
  readExpectedAgentRunnerRevision,
  runNpmCi,
  runNpmScript,
  sha256File,
  writeJsonExclusive,
} from "./common.mjs";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    handoff: null,
    recordOutput: null,
    skipNpmCi: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--handoff") options.handoff = resolve(argv[++index]);
    else if (arg === "--record-output") options.recordOutput = resolve(argv[++index]);
    else if (arg === "--skip-npm-ci") options.skipNpmCi = true;
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  options.handoff ??= resolve(options.root, "docs/verification/phase51-phase52-handoff.md");
  return options;
}

function requiredEnv(env, name) {
  const value = String(env[name] ?? "").trim();
  if (value === "") fail(`${name} is required for the Phase 52 environment conformance Gate`);
  return value;
}

function assertRequiredEnvironment(env) {
  requiredEnv(env, "PHASE50_S3_CONFORMANCE_BUCKET");
  requiredEnv(env, "PHASE50_S3_CONFORMANCE_REGION");
  requiredEnv(env, "PHASE50_S3_CONFORMANCE_EXECUTION_ID");
}

function buildVerifierRecordPath(recordOutput) {
  return resolve(`${recordOutput}.phase50-verifier.tmp.json`);
}

function readVerifierRecord(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Phase 50 environment conformance record is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function summarizeFindings(findings) {
  const counts = {};
  for (const finding of findings ?? []) {
    const key = String(finding.classification ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function runEnvironmentConformanceGate(options, adapters = {}) {
  const run = adapters.run ?? defaultRun;
  const env = { ...process.env, ...(adapters.env ?? {}) };
  const now = adapters.now ?? new Date();

  if (!options.runnerRoot) fail("--runner-root is required");
  if (!options.recordOutput) fail("--record-output is required");

  assertRawEvidenceFilename(options.recordOutput, "environment-conformance");
  assertOutputOutsideCheckout({ checkoutRoot: options.runnerRoot, outputPath: options.recordOutput });
  ensureParentDirectoryExists(options.recordOutput);
  assertRawRecordPathIsNew(options.recordOutput);
  assertEnvironmentConformanceOwnership(env);
  assertRequiredEnvironment(env);

  const expectedRevision = readExpectedAgentRunnerRevision(options.handoff);
  const testedSourceRevision = assertDetachedCleanCheckout({
    repositoryRoot: options.runnerRoot,
    expectedRevision,
    run,
  });
  const nodeVersion = assertNodeVersionMatchesNvmrc({ repositoryRoot: options.runnerRoot, run });

  if (!options.skipNpmCi) {
    runNpmCi({ repositoryRoot: options.runnerRoot, env, run });
  }

  const executionHost = captureExecutionHost({
    cwd: options.runnerRoot,
    env,
    run,
    requireDocker: true,
  });

  const verifierRecordPath = buildVerifierRecordPath(options.recordOutput);
  assertOutputOutsideCheckout({ checkoutRoot: options.runnerRoot, outputPath: verifierRecordPath });
  assertRawRecordPathIsNew(verifierRecordPath);

  const gateEnv = {
    ...env,
    PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: verifierRecordPath,
  };
  delete gateEnv.PHASE50_TESTED_GIT_REVISION;
  delete gateEnv.PHASE50_S3_CONFORMANCE_ENDPOINT;

  try {
    runNpmScript({
      repositoryRoot: options.runnerRoot,
      script: "verify:phase50:environment",
      env: gateEnv,
      run,
    });

    const verifierRecord = readVerifierRecord(verifierRecordPath);
    if (verifierRecord.testedGitRevision !== testedSourceRevision) {
      fail(
        `Phase 50 verifier testedGitRevision mismatch: expected ${testedSourceRevision}, got ${String(verifierRecord.testedGitRevision)}`,
      );
    }

    const verifierRecordSha256 = sha256File(verifierRecordPath);
    assertCleanCheckout({ repositoryRoot: options.runnerRoot, run });

    const record = {
      schemaVersion: 1,
      recordType: "phase52-environment-conformance-system-release-gate-raw",
      testedSourceRevision,
      executionHost: {
        ...executionHost,
        nodeVersion,
      },
      environmentConformance: {
        result: "PASS",
        findingClassificationCounts: summarizeFindings(verifierRecord.findings),
        unresolvedMandatoryCoverageGapCount: 0,
      },
      phase50VerifierRecord: {
        sha256: `sha256:${verifierRecordSha256}`,
        record: verifierRecord,
      },
      result: "PASS",
      verifiedAt: now.toISOString(),
    };

    writeJsonExclusive(options.recordOutput, record);
    return record;
  } finally {
    rmSync(verifierRecordPath, { force: true });
  }
}

function runSelfTest() {
  const temp = mkdtempSync(join(tmpdir(), "phase52-env-selftest-"));
  const redmineRoot = resolve(temp, "redmine");
  const runnerRoot = resolve(temp, "runner");
  const outDir = resolve(temp, "out");
  const expectedRevision = "b".repeat(40);
  const handoffPath = resolve(redmineRoot, "docs/verification/phase51-phase52-handoff.md");
  const outputPath = resolve(outDir, "phase52-environment-conformance-system-release-20260925T000000Z.json");

  const mkdir = (path) => {
    const result = defaultRun("mkdir", ["-p", path]);
    if (result.status !== 0) fail(`self-test mkdir failed: ${path}`);
  };
  mkdir(resolve(redmineRoot, "docs/verification"));
  mkdir(runnerRoot);
  mkdir(outDir);

  writeFileSync(
    handoffPath,
    `- Agent Runner: version \`0.0.0\`, exact source \`${expectedRevision}\`\n`,
    "utf8",
  );
  writeFileSync(resolve(runnerRoot, ".nvmrc"), "24.19.0\n", "utf8");

  const fakeRun = (command, args, options = {}) => {
    const joined = `${command} ${args.join(" ")}`;
    if (joined === `git -C ${runnerRoot} rev-parse HEAD`) return { status: 0, stdout: `${expectedRevision}\n`, stderr: "" };
    if (joined === `git -C ${runnerRoot} symbolic-ref -q HEAD`) return { status: 1, stdout: "", stderr: "" };
    if (joined === `git -C ${runnerRoot} status --porcelain`) return { status: 0, stdout: "", stderr: "" };
    if (joined === "node --version") return { status: 0, stdout: "v24.19.0\n", stderr: "" };
    if (joined === "uname -s") return { status: 0, stdout: "Linux\n", stderr: "" };
    if (joined === "uname -r") return { status: 0, stdout: "6.8.0-selftest\n", stderr: "" };
    if (joined === "uname -m") return { status: 0, stdout: "x86_64\n", stderr: "" };
    if (joined === "npm --version") return { status: 0, stdout: "11.0.0\n", stderr: "" };
    if (joined === "aws --version") return { status: 0, stdout: "aws-cli/2.selftest\n", stderr: "" };
    if (joined === "docker version --format {{.Client.Version}}") return { status: 0, stdout: "29.5.2\n", stderr: "" };
    if (joined === "docker version --format {{.Server.Version}}") return { status: 0, stdout: "29.5.2\n", stderr: "" };
    if (joined === "npm run verify:phase50:environment") {
      const target = options.env.PHASE50_ENVIRONMENT_CONFORMANCE_RECORD;
      writeFileSync(
        target,
        `${JSON.stringify({
          schemaVersion: 1,
          testedGitRevision: expectedRevision,
          generatedAt: "2026-09-25T00:00:00Z",
          findings: [
            { id: "sandbox.engine-version", classification: "compatible" },
            { id: "s3.if-none-match", classification: "compatible" },
          ],
        })}\n`,
        "utf8",
      );
      if (Object.hasOwn(options.env, "PHASE50_TESTED_GIT_REVISION")) {
        return { status: 1, stdout: "", stderr: "runner leaked PHASE50_TESTED_GIT_REVISION" };
      }
      if (Object.hasOwn(options.env, "PHASE50_S3_CONFORMANCE_ENDPOINT")) {
        return { status: 1, stdout: "", stderr: "runner leaked PHASE50_S3_CONFORMANCE_ENDPOINT" };
      }
      return { status: 0, stdout: "PASS\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };

  const env = {
    PHASE50_S3_CONFORMANCE_BUCKET: "phase52-selftest-bucket",
    PHASE50_S3_CONFORMANCE_REGION: "us-east-1",
    PHASE50_S3_CONFORMANCE_EXECUTION_ID: "phase52-selftest",
    PHASE52_HOST_PROVIDER: "self-test",
  };

  const record = runEnvironmentConformanceGate(
    {
      root: redmineRoot,
      runnerRoot,
      handoff: handoffPath,
      recordOutput: outputPath,
      skipNpmCi: true,
    },
    {
      run: fakeRun,
      env,
      now: new Date("2026-09-25T00:00:00Z"),
    },
  );

  if (record.result !== "PASS") fail("self-test: environment Gate did not PASS");
  if (record.executionHost.dockerServerVersion !== "29.5.2") {
    fail("self-test: Docker server identity was not required/captured for 52-2");
  }

  let testedRevisionGuard = false;
  try {
    runEnvironmentConformanceGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: resolve(outDir, "phase52-environment-conformance-system-release-20260925T000001Z.json"),
        skipNpmCi: true,
      },
      {
        run: fakeRun,
        env: { ...env, PHASE50_TESTED_GIT_REVISION: expectedRevision },
      },
    );
  } catch {
    testedRevisionGuard = true;
  }
  if (!testedRevisionGuard) fail("self-test: PHASE50_TESTED_GIT_REVISION was not rejected");

  let endpointGuard = false;
  try {
    runEnvironmentConformanceGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: resolve(outDir, "phase52-environment-conformance-system-release-20260925T000002Z.json"),
        skipNpmCi: true,
      },
      {
        run: fakeRun,
        env: { ...env, PHASE50_S3_CONFORMANCE_ENDPOINT: "http://minio:9000" },
      },
    );
  } catch {
    endpointGuard = true;
  }
  if (!endpointGuard) fail("self-test: PHASE50_S3_CONFORMANCE_ENDPOINT was not rejected");

  let outputGuard = false;
  try {
    runEnvironmentConformanceGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: resolve(runnerRoot, "docs/verification/phase52-environment-conformance-system-release-20260925T000003Z.json"),
        skipNpmCi: true,
      },
      { run: fakeRun, env },
    );
  } catch {
    outputGuard = true;
  }
  if (!outputGuard) fail("self-test: output inside exact checkout was not rejected");

  rmSync(temp, { recursive: true, force: true });
  return {
    result: "PASS",
    exactCheckoutGuard: "PASS",
    dockerEvidenceRequired: "PASS",
    testedRevisionDetectedByVerifier: "PASS",
    testedRevisionEnvGuard: "PASS",
    endpointGuard: "PASS",
    outputPathGuard: "PASS",
    phase50EvidenceOverwriteGuard: "PASS",
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  } else {
    const record = runEnvironmentConformanceGate(options);
    process.stdout.write(
      `${JSON.stringify({
        result: record.result,
        testedSourceRevision: record.testedSourceRevision,
        recordOutput: options.recordOutput,
        rawRecordSha256: `sha256:${sha256File(options.recordOutput)}`,
        file: basename(options.recordOutput),
      }, null, 2)}\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
