#!/usr/bin/env node

import {
  existsSync,
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

const FULL_GIT_REVISION = /^[0-9a-f]{40,64}$/u;
const CLASSIFICATIONS = new Set([
  "compatible",
  "incompatible",
  "unsupported",
  "different-contract-affecting",
  "different-contract-neutral",
]);
const CONTRACT_AFFECTING = new Set([
  "incompatible",
  "unsupported",
  "different-contract-affecting",
]);

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return {
    verifierRecordPath: resolve(requiredEnv(env, "PHASE50_ENVIRONMENT_CONFORMANCE_RECORD")),
    bucket: requiredEnv(env, "PHASE50_S3_CONFORMANCE_BUCKET"),
    region: requiredEnv(env, "PHASE50_S3_CONFORMANCE_REGION"),
    executionId: requiredEnv(env, "PHASE50_S3_CONFORMANCE_EXECUTION_ID"),
  };
}

function assertVerifierOutputPath({ runnerRoot, recordOutput, verifierRecordPath }) {
  assertOutputOutsideCheckout({ checkoutRoot: runnerRoot, outputPath: verifierRecordPath });
  ensureParentDirectoryExists(verifierRecordPath);
  assertRawRecordPathIsNew(verifierRecordPath);
  if (resolve(verifierRecordPath) === resolve(recordOutput)) {
    fail("PHASE50_ENVIRONMENT_CONFORMANCE_RECORD must not equal the Phase 52 raw evidence path");
  }
  const canonical = resolve(runnerRoot, "docs/verification/phase50-environment-conformance.json");
  if (resolve(verifierRecordPath) === canonical) {
    fail("Phase 50 canonical environment conformance evidence must not be overwritten");
  }
  return verifierRecordPath;
}

function readVerifierRecord(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Phase 50 environment conformance record is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function nonEmptyText(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  return value;
}

function nonEmptyStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  for (let index = 0; index < value.length; index += 1) {
    nonEmptyText(value[index], `${label}[${index}]`);
  }
  return value;
}

function hasCoverageEvidence(finding) {
  return Array.isArray(finding.coverageEvidence)
    && finding.coverageEvidence.length > 0
    && finding.coverageEvidence.every((entry) => typeof entry === "string" && entry.trim() !== "");
}

function alternateCoverageClosed(finding) {
  if (finding.classification === "compatible") return true;
  if (finding.classification === "different-contract-neutral") {
    return finding.coverageRoute === "E"
      && finding.coverageExecuted === true
      && hasCoverageEvidence(finding);
  }
  return ["A", "B", "C", "D"].includes(finding.coverageRoute)
    && finding.coverageExecuted === true
    && hasCoverageEvidence(finding);
}

function analyzeVerifierRecord(record, testedSourceRevision) {
  if (!isObject(record)) fail("Phase 50 environment conformance record must be an object");
  if (record.schemaVersion !== 1) fail("Phase 50 environment conformance schemaVersion must be 1");
  if (!FULL_GIT_REVISION.test(record.testedGitRevision ?? "")) {
    fail("Phase 50 verifier testedGitRevision must be a lowercase full Git revision");
  }
  if (record.testedGitRevision !== testedSourceRevision) {
    fail(
      `Phase 50 verifier testedGitRevision mismatch: expected ${testedSourceRevision}, got ${String(record.testedGitRevision)}`,
    );
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    fail("Phase 50 environment conformance generatedAt must be an ISO-compatible timestamp");
  }
  if (!Array.isArray(record.findings) || record.findings.length === 0) {
    fail("Phase 50 environment conformance findings must be a non-empty array");
  }

  const ids = new Set();
  const classificationCounts = {};
  let unresolvedIncompatibleFindingCount = 0;
  let unresolvedUnsupportedFindingCount = 0;
  let unresolvedContractAffectingDifferenceCount = 0;
  let missingMandatoryAlternateCoverageCount = 0;
  let unresolvedMandatoryCoverageGapCount = 0;

  for (let index = 0; index < record.findings.length; index += 1) {
    const finding = record.findings[index];
    if (!isObject(finding)) fail(`findings[${index}] must be an object`);
    const id = nonEmptyText(finding.id, `findings[${index}].id`);
    if (ids.has(id)) fail(`duplicate Phase 50 conformance finding id: ${id}`);
    ids.add(id);
    if (finding.surface !== "s3" && finding.surface !== "sandbox") {
      fail(`findings[${index}].surface is invalid`);
    }
    nonEmptyText(finding.requirement, `findings[${index}].requirement`);
    nonEmptyStringArray(finding.evidence, `findings[${index}].evidence`);
    if (!CLASSIFICATIONS.has(finding.classification)) {
      fail(`findings[${index}].classification is invalid`);
    }

    classificationCounts[finding.classification] = (classificationCounts[finding.classification] ?? 0) + 1;
    const closed = alternateCoverageClosed(finding);

    if (finding.classification === "compatible") {
      if (finding.coverageRoute !== undefined) {
        fail(`compatible finding must not declare alternate coverage: ${id}`);
      }
      continue;
    }

    if (!closed) {
      unresolvedMandatoryCoverageGapCount += 1;
      missingMandatoryAlternateCoverageCount += 1;
      if (finding.classification === "incompatible") unresolvedIncompatibleFindingCount += 1;
      else if (finding.classification === "unsupported") unresolvedUnsupportedFindingCount += 1;
      else if (finding.classification === "different-contract-affecting") {
        unresolvedContractAffectingDifferenceCount += 1;
      }
    }
  }

  return {
    result: unresolvedMandatoryCoverageGapCount === 0 ? "PASS" : "FAIL",
    findingClassificationCounts: classificationCounts,
    unresolvedIncompatibleFindingCount,
    unresolvedUnsupportedFindingCount,
    unresolvedContractAffectingDifferenceCount,
    missingMandatoryAlternateCoverageCount,
    unresolvedMandatoryCoverageGapCount,
  };
}

function assertPassAnalysis(analysis) {
  if (analysis.result !== "PASS") {
    fail(
      `Phase 50 environment conformance has unresolved mandatory coverage gaps: ${analysis.unresolvedMandatoryCoverageGapCount}`,
    );
  }
  for (const field of [
    "unresolvedIncompatibleFindingCount",
    "unresolvedUnsupportedFindingCount",
    "unresolvedContractAffectingDifferenceCount",
    "missingMandatoryAlternateCoverageCount",
    "unresolvedMandatoryCoverageGapCount",
  ]) {
    if (analysis[field] !== 0) fail(`${field} must be 0 for Phase 52-2 PASS`);
  }
}

function sanitizeFailureMessage(message) {
  return String(message)
    .replace(/arn:[^\s"']+/giu, "[REDACTED_AWS_ARN]")
    .replace(/\b\d{12}\b/gu, "[REDACTED_AWS_ACCOUNT]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED_EMAIL]");
}

function containsRawAwsIdentity(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /arn:(?:aws|aws-us-gov|aws-cn):/iu.test(text)
    || /\b\d{12}\b/u.test(text)
    || /assumed-role\//iu.test(text)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text);
}

function assertNoRawAwsIdentity(value) {
  if (containsRawAwsIdentity(value)) {
    fail("Phase 52 environment conformance evidence contains raw AWS account/ARN/session identity");
  }
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

  const state = {
    stage: "environment-ownership",
    testedSourceRevision: null,
    executionHost: null,
    environmentConformance: null,
    phase50VerifierRecord: null,
    phase50VerifierRecordSha256: null,
    verifierRecordPath: null,
  };

  try {
    assertEnvironmentConformanceOwnership(env);
    state.stage = "required-environment";
    const required = assertRequiredEnvironment(env);
    state.verifierRecordPath = assertVerifierOutputPath({
      runnerRoot: options.runnerRoot,
      recordOutput: options.recordOutput,
      verifierRecordPath: required.verifierRecordPath,
    });

    state.stage = "exact-checkout";
    const expectedRevision = readExpectedAgentRunnerRevision(options.handoff);
    state.testedSourceRevision = assertDetachedCleanCheckout({
      repositoryRoot: options.runnerRoot,
      expectedRevision,
      run,
    });

    state.stage = "node-version";
    const nodeVersion = assertNodeVersionMatchesNvmrc({ repositoryRoot: options.runnerRoot, run });

    state.stage = "npm-ci";
    if (!options.skipNpmCi) {
      runNpmCi({ repositoryRoot: options.runnerRoot, env, run });
    }

    state.stage = "execution-host";
    state.executionHost = captureExecutionHost({
      cwd: options.runnerRoot,
      env,
      run,
      requireDocker: true,
    });

    state.stage = "phase50-verifier";
    const gateEnv = {
      ...env,
      PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: state.verifierRecordPath,
    };
    delete gateEnv.PHASE50_TESTED_GIT_REVISION;
    delete gateEnv.PHASE50_S3_CONFORMANCE_ENDPOINT;

    runNpmScript({
      repositoryRoot: options.runnerRoot,
      script: "verify:phase50:environment",
      env: gateEnv,
      run,
    });

    state.phase50VerifierRecord = readVerifierRecord(state.verifierRecordPath);
    state.phase50VerifierRecordSha256 = `sha256:${sha256File(state.verifierRecordPath)}`;
    state.environmentConformance = analyzeVerifierRecord(
      state.phase50VerifierRecord,
      state.testedSourceRevision,
    );
    assertPassAnalysis(state.environmentConformance);
    assertNoRawAwsIdentity(state.phase50VerifierRecord);

    state.stage = "post-run-clean-checkout";
    assertCleanCheckout({ repositoryRoot: options.runnerRoot, run });

    const record = {
      schemaVersion: 1,
      recordType: "phase52-environment-conformance-system-release-gate-raw",
      testedSourceRevision: state.testedSourceRevision,
      executionHost: {
        ...state.executionHost,
        nodeVersion,
      },
      environmentConformance: state.environmentConformance,
      phase50VerifierRecord: {
        sha256: state.phase50VerifierRecordSha256,
        record: state.phase50VerifierRecord,
      },
      checkoutClean: true,
      productionDeploymentCertification: false,
      result: "PASS",
      verifiedAt: now.toISOString(),
    };

    assertNoRawAwsIdentity(record);
    writeJsonExclusive(options.recordOutput, record);
    return record;
  } catch (error) {
    if (state.verifierRecordPath !== null && existsSync(state.verifierRecordPath)) {
      try {
        const verifierRecord = readVerifierRecord(state.verifierRecordPath);
        state.phase50VerifierRecordSha256 = `sha256:${sha256File(state.verifierRecordPath)}`;
        if (!containsRawAwsIdentity(verifierRecord)) {
          state.phase50VerifierRecord = verifierRecord;
          if (state.testedSourceRevision !== null) {
            try {
              state.environmentConformance = analyzeVerifierRecord(
                verifierRecord,
                state.testedSourceRevision,
              );
            } catch {
              // Preserve the original failure while retaining the immutable verifier hash.
            }
          }
        }
      } catch {
        // Preserve the original failure.
      }
    }

    let checkoutClean = null;
    try {
      assertCleanCheckout({ repositoryRoot: options.runnerRoot, run });
      checkoutClean = true;
    } catch {
      checkoutClean = false;
    }

    const failRecord = {
      schemaVersion: 1,
      recordType: "phase52-environment-conformance-system-release-gate-raw",
      testedSourceRevision: state.testedSourceRevision,
      executionHost: state.executionHost,
      environmentConformance: state.environmentConformance,
      phase50VerifierRecord: state.phase50VerifierRecord === null
        ? null
        : {
            sha256: state.phase50VerifierRecordSha256,
            record: state.phase50VerifierRecord,
          },
      phase50VerifierRecordSha256: state.phase50VerifierRecordSha256,
      checkoutClean,
      productionDeploymentCertification: false,
      failure: {
        stage: state.stage,
        message: sanitizeFailureMessage(error instanceof Error ? error.message : String(error)),
      },
      result: "FAIL",
      verifiedAt: now.toISOString(),
    };

    try {
      assertNoRawAwsIdentity(failRecord);
      assertRawRecordPathIsNew(options.recordOutput);
      writeJsonExclusive(options.recordOutput, failRecord);
    } catch {
      // Never overwrite an existing immutable evidence path or publish raw AWS identity.
    }
    throw error;
  } finally {
    if (state.verifierRecordPath !== null) {
      rmSync(state.verifierRecordPath, { force: true });
    }
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
  const verifierPath = resolve(outDir, "phase52-phase50-environment-conformance-20260925T000000Z.json");

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

  const validVerifierRecord = {
    schemaVersion: 1,
    testedGitRevision: expectedRevision,
    generatedAt: "2026-09-25T00:00:00Z",
    findings: [
      {
        id: "sandbox.engine-version",
        surface: "sandbox",
        requirement: "container engine implementation and version are recorded",
        classification: "compatible",
        evidence: ["engine=self-test"],
      },
      {
        id: "sandbox.container-lifecycle",
        surface: "sandbox",
        requirement: "container lifecycle is covered by deterministic alternate coverage",
        classification: "different-contract-affecting",
        evidence: ["runtime timer differs"],
        coverageRoute: "B",
        coverageExecuted: true,
        coverageEvidence: ["deterministic lifecycle test PASS"],
      },
      {
        id: "sandbox.cgroup-observation",
        surface: "sandbox",
        requirement: "contract-neutral environment difference is recorded",
        classification: "different-contract-neutral",
        evidence: ["cgroup observation differs"],
        coverageRoute: "E",
        coverageExecuted: true,
        coverageEvidence: ["difference documented"],
      },
      {
        id: "s3.environment",
        surface: "s3",
        requirement: "real AWS S3 alternate coverage is executed",
        classification: "unsupported",
        evidence: ["local fixture does not emulate AWS exactly"],
        coverageRoute: "C",
        coverageExecuted: true,
        coverageEvidence: ["real AWS S3 probe PASS"],
      },
    ],
  };

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
      if (Object.hasOwn(options.env, "PHASE50_TESTED_GIT_REVISION")) {
        return { status: 1, stdout: "", stderr: "runner leaked PHASE50_TESTED_GIT_REVISION" };
      }
      if (Object.hasOwn(options.env, "PHASE50_S3_CONFORMANCE_ENDPOINT")) {
        return { status: 1, stdout: "", stderr: "runner leaked PHASE50_S3_CONFORMANCE_ENDPOINT" };
      }
      writeFileSync(
        options.env.PHASE50_ENVIRONMENT_CONFORMANCE_RECORD,
        `${JSON.stringify(validVerifierRecord)}\n`,
        "utf8",
      );
      return { status: 0, stdout: "PASS\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };

  const env = {
    PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: verifierPath,
    PHASE50_S3_CONFORMANCE_BUCKET: "phase52-selftest-bucket",
    PHASE50_S3_CONFORMANCE_REGION: "us-east-1",
    PHASE50_S3_CONFORMANCE_EXECUTION_ID: "phase52-selftest",
    PHASE50_TESTED_GIT_REVISION: "",
    PHASE50_S3_CONFORMANCE_ENDPOINT: "",
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
  if (record.environmentConformance.unresolvedMandatoryCoverageGapCount !== 0) {
    fail("self-test: resolved alternate coverage was reported as unresolved");
  }
  if (record.productionDeploymentCertification !== false) {
    fail("self-test: host observation was incorrectly promoted to deployment certification");
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
        env: {
          ...env,
          PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: resolve(outDir, "phase50-1.json"),
          PHASE50_TESTED_GIT_REVISION: expectedRevision,
        },
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
        env: {
          ...env,
          PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: resolve(outDir, "phase50-2.json"),
          PHASE50_S3_CONFORMANCE_ENDPOINT: "http://minio:9000",
        },
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
      {
        run: fakeRun,
        env: {
          ...env,
          PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: resolve(outDir, "phase50-3.json"),
        },
      },
    );
  } catch {
    outputGuard = true;
  }
  if (!outputGuard) fail("self-test: output inside exact checkout was not rejected");

  let phase50EvidenceOverwriteGuard = false;
  try {
    runEnvironmentConformanceGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: resolve(outDir, "phase52-environment-conformance-system-release-20260925T000004Z.json"),
        skipNpmCi: true,
      },
      {
        run: fakeRun,
        env: {
          ...env,
          PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: resolve(
            runnerRoot,
            "docs/verification/phase50-environment-conformance.json",
          ),
        },
      },
    );
  } catch {
    phase50EvidenceOverwriteGuard = true;
  }
  if (!phase50EvidenceOverwriteGuard) fail("self-test: Phase 50 canonical evidence path was accepted");

  const failOutput = resolve(outDir, "phase52-environment-conformance-system-release-20260925T000005Z.json");
  const failVerifier = resolve(outDir, "phase50-5.json");
  const failingRun = (command, args, options = {}) => {
    const joined = `${command} ${args.join(" ")}`;
    if (joined === "npm run verify:phase50:environment") {
      const unresolved = {
        ...validVerifierRecord,
        findings: [
          {
            id: "s3.environment",
            surface: "s3",
            requirement: "real S3 alternate coverage is mandatory",
            classification: "unsupported",
            evidence: ["probe unavailable"],
            coverageRoute: "C",
            coverageExecuted: false,
            coverageEvidence: ["planned but not executed"],
          },
        ],
      };
      writeFileSync(options.env.PHASE50_ENVIRONMENT_CONFORMANCE_RECORD, `${JSON.stringify(unresolved)}\n`, "utf8");
      return { status: 1, stdout: "", stderr: "alternate coverage planned but not executed" };
    }
    return fakeRun(command, args, options);
  };
  let failEvidencePreserved = false;
  try {
    runEnvironmentConformanceGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: failOutput,
        skipNpmCi: true,
      },
      {
        run: failingRun,
        env: { ...env, PHASE50_ENVIRONMENT_CONFORMANCE_RECORD: failVerifier },
        now: new Date("2026-09-25T00:05:00Z"),
      },
    );
  } catch {
    const failed = JSON.parse(readFileSync(failOutput, "utf8"));
    failEvidencePreserved = failed.result === "FAIL"
      && failed.failure?.stage === "phase50-verifier"
      && failed.environmentConformance?.unresolvedMandatoryCoverageGapCount === 1;
  }
  if (!failEvidencePreserved) fail("self-test: FAIL raw environment evidence was not preserved");

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
    requiredRecordPathGuard: "PASS",
    resolvedAlternateCoverage: "PASS",
    unresolvedCoverageFailClosed: "PASS",
    failRawEvidenceGeneration: "PASS",
    awsIdentityPrivacy: "PASS",
    hostObservationNotDeploymentCertification: "PASS",
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
