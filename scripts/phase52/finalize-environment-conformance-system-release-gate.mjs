#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  assertEvidenceRevisionReachableFromMain,
  assertRawEvidenceFilename,
  defaultRun,
  gitBlobShaAtRevision,
  makeInitialEvidenceRecord,
  makeReentryEvidenceRecord,
  readExpectedAgentRunnerRevision,
  readPhase52Schema,
  requireSuccess,
  sha256Bytes,
  validateEvidenceAgainstSchema,
  writeJsonExclusive,
} from "./common.mjs";

const FULL_GIT_REVISION = /^[0-9a-f]{40,64}$/u;
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/u;
const RAW_RECORD_TYPE = "phase52-environment-conformance-system-release-gate-raw";
const CANONICAL_RECORD_TYPE = "phase52-environment-conformance-system-release-gate";
const DEFAULT_EVIDENCE_REPOSITORY = "mcp-mamono210/ai-agent-runner";
const DEFAULT_CANONICAL_PATH = "docs/verification/phase52-environment-conformance-system-release-gate.json";

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(raw, name) {
  if (raw === undefined || !/^[1-9]\d*$/u.test(raw)) {
    fail(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name} must be a positive safe integer`);
  return value;
}

function normalizeRepositoryPath(input) {
  const value = String(input ?? "").trim().replaceAll("\\", "/").replace(/^\.\//u, "");
  if (value === "") fail("--evidence-path is required");
  if (isAbsolute(value) || value.startsWith("/")) fail("evidence path must be repository-relative");
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail("evidence path must not contain empty, dot, or parent segments");
  }
  if (!value.startsWith("docs/verification/")) {
    fail("Phase 52 raw evidence must be committed under docs/verification/");
  }
  assertRawEvidenceFilename(value, "environment-conformance");
  return value;
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    handoff: null,
    evidenceRevision: null,
    evidencePath: null,
    evidenceRepository: DEFAULT_EVIDENCE_REPOSITORY,
    output: null,
    remoteMain: "origin/main",
    replaceExisting: false,
    invalidationReason: null,
    invalidatingDefectIssueId: null,
    invalidatedAt: null,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--handoff") options.handoff = resolve(argv[++index]);
    else if (arg === "--evidence-revision") options.evidenceRevision = argv[++index];
    else if (arg === "--evidence-path") options.evidencePath = argv[++index];
    else if (arg === "--evidence-repository") options.evidenceRepository = argv[++index];
    else if (arg === "--output") options.output = resolve(argv[++index]);
    else if (arg === "--remote-main") options.remoteMain = argv[++index];
    else if (arg === "--replace-existing") options.replaceExisting = true;
    else if (arg === "--invalidation-reason") options.invalidationReason = argv[++index];
    else if (arg === "--invalidating-defect-issue-id") {
      options.invalidatingDefectIssueId = parsePositiveInteger(argv[++index], arg);
    } else if (arg === "--invalidated-at") options.invalidatedAt = argv[++index];
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  options.handoff ??= resolve(options.root, "docs/verification/phase51-phase52-handoff.md");
  options.output ??= resolve(options.root, DEFAULT_CANONICAL_PATH);
  return options;
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
    fail("raw environment evidence contains prohibited AWS account/ARN/session identity");
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
}

function assertEnvironmentSummary(summary, requirePass) {
  if (!isObject(summary)) fail("raw evidence environmentConformance must be an object");
  if (summary.result !== "PASS" && summary.result !== "FAIL") {
    fail("environmentConformance.result must be PASS or FAIL");
  }
  if (!isObject(summary.findingClassificationCounts)) {
    fail("environmentConformance.findingClassificationCounts must be an object");
  }
  for (const value of Object.values(summary.findingClassificationCounts)) {
    assertNonNegativeInteger(value, "findingClassificationCounts value");
  }

  for (const field of [
    "unresolvedIncompatibleFindingCount",
    "unresolvedUnsupportedFindingCount",
    "unresolvedContractAffectingDifferenceCount",
    "missingMandatoryAlternateCoverageCount",
    "unresolvedMandatoryCoverageGapCount",
  ]) {
    assertNonNegativeInteger(summary[field], `environmentConformance.${field}`);
  }

  if (requirePass) {
    if (summary.result !== "PASS") fail("PASS raw evidence requires environmentConformance.result=PASS");
    for (const field of [
      "unresolvedIncompatibleFindingCount",
      "unresolvedUnsupportedFindingCount",
      "unresolvedContractAffectingDifferenceCount",
      "missingMandatoryAlternateCoverageCount",
      "unresolvedMandatoryCoverageGapCount",
    ]) {
      if (summary[field] !== 0) fail(`PASS raw evidence requires environmentConformance.${field}=0`);
    }
  }
  return summary;
}

function assertPhase50VerifierRecord(raw, testedSourceRevision) {
  if (!isObject(raw)) fail("raw evidence phase50VerifierRecord must be an object for a PASS record");
  if (!SHA256_ID.test(raw.sha256 ?? "")) fail("phase50VerifierRecord.sha256 is invalid");
  if (!isObject(raw.record)) fail("phase50VerifierRecord.record must be an object");
  if (raw.record.schemaVersion !== 1) fail("Phase 50 verifier schemaVersion must be 1");
  if (raw.record.testedGitRevision !== testedSourceRevision) {
    fail("Phase 50 verifier testedGitRevision does not match raw testedSourceRevision");
  }
  if (!Array.isArray(raw.record.findings) || raw.record.findings.length === 0) {
    fail("Phase 50 verifier findings must be non-empty");
  }
  assertNoRawAwsIdentity(raw.record);
  return raw;
}

function assertExecutionHost(host, requirePass) {
  if (!isObject(host)) {
    if (requirePass) fail("PASS raw evidence executionHost is required");
    return host;
  }
  if (requirePass) {
    for (const field of ["hostProvider", "nodeVersion", "npmVersion", "awsCliVersion", "dockerClientVersion", "dockerServerVersion"]) {
      if (typeof host[field] !== "string" || host[field].trim() === "") {
        fail(`PASS raw evidence executionHost.${field} is required`);
      }
    }
    if (!isObject(host.uname)) fail("PASS raw evidence executionHost.uname is required");
  }
  return host;
}

function assertRawEnvironmentRecord(raw, expectedTestedRevision) {
  if (!isObject(raw)) fail("raw evidence must be a JSON object");
  if (raw.schemaVersion !== 1) fail("raw evidence schemaVersion must be 1");
  if (raw.recordType !== RAW_RECORD_TYPE) fail(`raw evidence recordType must be ${RAW_RECORD_TYPE}`);
  if (raw.result !== "PASS" && raw.result !== "FAIL") fail("raw evidence result must be PASS or FAIL");
  if (typeof raw.verifiedAt !== "string" || Number.isNaN(Date.parse(raw.verifiedAt))) {
    fail("raw evidence verifiedAt must be an ISO-compatible timestamp");
  }
  if (raw.productionDeploymentCertification !== false) {
    fail("Phase 52-2 host evidence must not certify production deployment");
  }
  assertNoRawAwsIdentity(raw);

  if (raw.result === "PASS") {
    if (!FULL_GIT_REVISION.test(raw.testedSourceRevision ?? "")) {
      fail("PASS raw evidence testedSourceRevision must be a full Git revision");
    }
    if (raw.testedSourceRevision !== expectedTestedRevision) {
      fail("PASS raw evidence testedSourceRevision does not match Phase 51 handoff exact RC");
    }
    assertExecutionHost(raw.executionHost, true);
    assertEnvironmentSummary(raw.environmentConformance, true);
    assertPhase50VerifierRecord(raw.phase50VerifierRecord, raw.testedSourceRevision);
    if (raw.checkoutClean !== true) fail("PASS raw evidence requires checkoutClean=true");
  } else {
    if (!isObject(raw.failure) || typeof raw.failure.stage !== "string" || typeof raw.failure.message !== "string") {
      fail("FAIL raw evidence must preserve failure stage and sanitized message");
    }
    if (raw.testedSourceRevision !== null && !FULL_GIT_REVISION.test(raw.testedSourceRevision ?? "")) {
      fail("FAIL raw evidence testedSourceRevision must be null or a full Git revision");
    }
    if (raw.testedSourceRevision !== null && raw.testedSourceRevision !== expectedTestedRevision) {
      fail("FAIL raw evidence testedSourceRevision does not match Phase 51 handoff exact RC");
    }
    if (raw.environmentConformance !== null && raw.environmentConformance !== undefined) {
      assertEnvironmentSummary(raw.environmentConformance, false);
    }
    if (raw.phase50VerifierRecord !== null && raw.phase50VerifierRecord !== undefined) {
      if (!isObject(raw.phase50VerifierRecord)) fail("FAIL raw phase50VerifierRecord must be an object or null");
      if (!SHA256_ID.test(raw.phase50VerifierRecord.sha256 ?? "")) {
        fail("FAIL raw phase50VerifierRecord.sha256 is invalid");
      }
      assertNoRawAwsIdentity(raw.phase50VerifierRecord);
    }
  }
  return raw;
}

function readRawEvidenceAtRevision({ runnerRoot, revision, evidencePath, run }) {
  const stdout = requireSuccess(
    run("git", ["-C", runnerRoot, "show", `${revision}:${evidencePath}`], { cwd: runnerRoot }),
    "git show evidence revision:path",
  );
  let record;
  try {
    record = JSON.parse(stdout);
  } catch (error) {
    fail(`raw evidence at ${revision}:${evidencePath} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { rawText: stdout, record };
}

function buildCurrent({
  raw,
  evidenceRepository,
  evidenceRevision,
  evidencePath,
  evidenceBlobSha,
  rawRecordSha256,
}) {
  const summary = raw.environmentConformance ?? null;
  return {
    testedSourceRevision: raw.testedSourceRevision,
    evidenceRepository,
    evidenceRevision,
    evidencePath,
    evidenceBlobSha,
    rawRecordSha256,
    executionHost: raw.executionHost ?? null,
    environmentConformanceResult: summary?.result ?? null,
    findingClassificationCounts: summary?.findingClassificationCounts ?? {},
    unresolvedIncompatibleFindingCount: summary?.unresolvedIncompatibleFindingCount ?? null,
    unresolvedUnsupportedFindingCount: summary?.unresolvedUnsupportedFindingCount ?? null,
    unresolvedContractAffectingDifferenceCount: summary?.unresolvedContractAffectingDifferenceCount ?? null,
    missingMandatoryAlternateCoverageCount: summary?.missingMandatoryAlternateCoverageCount ?? null,
    unresolvedMandatoryCoverageGapCount: summary?.unresolvedMandatoryCoverageGapCount ?? null,
    phase50VerifierRecordSha256: raw.phase50VerifierRecord?.sha256
      ?? raw.phase50VerifierRecordSha256
      ?? null,
    productionDeploymentCertification: false,
    failure: raw.failure ?? null,
    checkoutClean: raw.checkoutClean ?? null,
    result: raw.result,
    verifiedAt: raw.verifiedAt,
  };
}

function persistCanonicalRecord(options, current, schema) {
  let record;
  if (existsSync(options.output)) {
    if (!options.replaceExisting) {
      fail("canonical Phase 52 environment Gate evidence already exists; use --replace-existing for a new generation");
    }
    const existing = JSON.parse(readFileSync(options.output, "utf8"));
    validateEvidenceAgainstSchema(existing, schema);
    record = makeReentryEvidenceRecord(existing, current, {
      invalidationReason: options.invalidationReason,
      invalidatingDefectIssueId: options.invalidatingDefectIssueId,
      ...(options.invalidatedAt === null ? {} : { invalidatedAt: options.invalidatedAt }),
    });
    validateEvidenceAgainstSchema(record, schema);
    writeFileSync(options.output, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  } else {
    mkdirSync(dirname(options.output), { recursive: true });
    record = makeInitialEvidenceRecord(CANONICAL_RECORD_TYPE, current);
    validateEvidenceAgainstSchema(record, schema);
    writeJsonExclusive(options.output, record);
  }
  return record;
}

export function finalizeEnvironmentConformanceSystemReleaseGate(options, adapters = {}) {
  const run = adapters.run ?? defaultRun;
  const schema = adapters.schema ?? readPhase52Schema(options.root);

  if (!options.runnerRoot) fail("--runner-root is required");
  if (!FULL_GIT_REVISION.test(options.evidenceRevision ?? "")) {
    fail("--evidence-revision must be a lowercase full Git revision");
  }
  const evidencePath = normalizeRepositoryPath(options.evidencePath);
  const evidenceRepository = String(options.evidenceRepository ?? "").trim();
  if (evidenceRepository === "") fail("--evidence-repository must not be blank");

  assertEvidenceRevisionReachableFromMain({
    repositoryRoot: options.runnerRoot,
    evidenceRevision: options.evidenceRevision,
    remoteMain: options.remoteMain,
    run,
  });

  const evidenceBlobSha = gitBlobShaAtRevision({
    repositoryRoot: options.runnerRoot,
    revision: options.evidenceRevision,
    path: evidencePath,
    run,
  });
  if (!SHA1.test(evidenceBlobSha)) fail("evidenceBlobSha must be an exact Git blob SHA-1");

  const { rawText, record: raw } = readRawEvidenceAtRevision({
    runnerRoot: options.runnerRoot,
    revision: options.evidenceRevision,
    evidencePath,
    run,
  });
  const expectedTestedRevision = readExpectedAgentRunnerRevision(options.handoff);
  assertRawEnvironmentRecord(raw, expectedTestedRevision);

  const current = buildCurrent({
    raw,
    evidenceRepository,
    evidenceRevision: options.evidenceRevision,
    evidencePath,
    evidenceBlobSha,
    rawRecordSha256: `sha256:${sha256Bytes(rawText)}`,
  });
  const canonical = persistCanonicalRecord(options, current, schema);

  return { record: canonical, current };
}

function passRawFixture(testedRevision) {
  return {
    schemaVersion: 1,
    recordType: RAW_RECORD_TYPE,
    testedSourceRevision: testedRevision,
    executionHost: {
      hostProvider: "self-test",
      uname: { sysname: "Linux", kernelRelease: "self-test", machine: "x86_64" },
      nodeVersion: "24.19.0",
      npmVersion: "11.0.0",
      awsCliVersion: "aws-cli/2.selftest",
      dockerClientVersion: "29.5.2",
      dockerServerVersion: "29.5.2",
    },
    environmentConformance: {
      result: "PASS",
      findingClassificationCounts: {
        compatible: 2,
        "different-contract-affecting": 1,
        unsupported: 1,
      },
      unresolvedIncompatibleFindingCount: 0,
      unresolvedUnsupportedFindingCount: 0,
      unresolvedContractAffectingDifferenceCount: 0,
      missingMandatoryAlternateCoverageCount: 0,
      unresolvedMandatoryCoverageGapCount: 0,
    },
    phase50VerifierRecord: {
      sha256: `sha256:${"1".repeat(64)}`,
      record: {
        schemaVersion: 1,
        testedGitRevision: testedRevision,
        generatedAt: "2026-09-25T02:00:00Z",
        findings: [
          {
            id: "s3.if-none-match",
            surface: "s3",
            requirement: "conditional write",
            classification: "compatible",
            evidence: ["PASS"],
          },
        ],
      },
    },
    checkoutClean: true,
    productionDeploymentCertification: false,
    result: "PASS",
    verifiedAt: "2026-09-25T02:00:00Z",
  };
}

function failRawFixture(testedRevision) {
  return {
    schemaVersion: 1,
    recordType: RAW_RECORD_TYPE,
    testedSourceRevision: testedRevision,
    executionHost: {
      hostProvider: "self-test",
      uname: { sysname: "Linux", kernelRelease: "self-test", machine: "x86_64" },
      nodeVersion: "24.19.0",
      npmVersion: "11.0.0",
      awsCliVersion: "aws-cli/2.selftest",
      dockerClientVersion: "29.5.2",
      dockerServerVersion: "29.5.2",
    },
    environmentConformance: {
      result: "FAIL",
      findingClassificationCounts: { unsupported: 1 },
      unresolvedIncompatibleFindingCount: 0,
      unresolvedUnsupportedFindingCount: 1,
      unresolvedContractAffectingDifferenceCount: 0,
      missingMandatoryAlternateCoverageCount: 1,
      unresolvedMandatoryCoverageGapCount: 1,
    },
    phase50VerifierRecord: null,
    phase50VerifierRecordSha256: `sha256:${"2".repeat(64)}`,
    checkoutClean: true,
    productionDeploymentCertification: false,
    failure: { stage: "phase50-verifier", message: "alternate coverage planned but not executed" },
    result: "FAIL",
    verifiedAt: "2026-09-25T01:00:00Z",
  };
}

function runSelfTest(root) {
  const temp = mkdtempSync(join(tmpdir(), "phase52-env-finalize-selftest-"));
  const redmineRoot = resolve(temp, "redmine");
  const runnerRoot = resolve(temp, "runner");
  const handoff = resolve(redmineRoot, "docs/verification/phase51-phase52-handoff.md");
  const output = resolve(redmineRoot, DEFAULT_CANONICAL_PATH);
  mkdirSync(dirname(handoff), { recursive: true });
  mkdirSync(runnerRoot, { recursive: true });

  const testedRevision = "a".repeat(40);
  const failRevision = "b".repeat(40);
  const passRevision = "c".repeat(40);
  const rawPathFail = "docs/verification/phase52-environment-conformance-system-release-20260925T010000Z.json";
  const rawPathPass = "docs/verification/phase52-environment-conformance-system-release-20260925T020000Z.json";
  const rawFail = `${JSON.stringify(failRawFixture(testedRevision), null, 2)}\n`;
  const rawPass = `${JSON.stringify(passRawFixture(testedRevision), null, 2)}\n`;
  writeFileSync(
    handoff,
    `- Agent Runner: version \`0.0.0\`, exact source \`${testedRevision}\`\n`,
    "utf8",
  );

  const rawByRevision = new Map([
    [`${failRevision}:${rawPathFail}`, rawFail],
    [`${passRevision}:${rawPathPass}`, rawPass],
  ]);
  const fakeRun = (command, args) => {
    const joined = `${command} ${args.join(" ")}`;
    if (joined === `git -C ${runnerRoot} cat-file -e ${failRevision}^{commit}`) return { status: 0, stdout: "", stderr: "" };
    if (joined === `git -C ${runnerRoot} cat-file -e ${passRevision}^{commit}`) return { status: 0, stdout: "", stderr: "" };
    if (joined === `git -C ${runnerRoot} merge-base --is-ancestor ${failRevision} origin/main`) return { status: 0, stdout: "", stderr: "" };
    if (joined === `git -C ${runnerRoot} merge-base --is-ancestor ${passRevision} origin/main`) return { status: 0, stdout: "", stderr: "" };
    if (joined === `git -C ${runnerRoot} rev-parse ${failRevision}:${rawPathFail}`) return { status: 0, stdout: `${"d".repeat(40)}\n`, stderr: "" };
    if (joined === `git -C ${runnerRoot} rev-parse ${passRevision}:${rawPathPass}`) return { status: 0, stdout: `${"e".repeat(40)}\n`, stderr: "" };
    if (command === "git" && args[2] === "show") {
      const raw = rawByRevision.get(args[3]);
      if (raw !== undefined) return { status: 0, stdout: raw, stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };

  const schema = readPhase52Schema(root);
  const first = finalizeEnvironmentConformanceSystemReleaseGate(
    {
      root: redmineRoot,
      runnerRoot,
      handoff,
      evidenceRevision: failRevision,
      evidencePath: rawPathFail,
      evidenceRepository: DEFAULT_EVIDENCE_REPOSITORY,
      output,
      remoteMain: "origin/main",
      replaceExisting: false,
      invalidationReason: null,
      invalidatingDefectIssueId: null,
      invalidatedAt: null,
    },
    { run: fakeRun, schema },
  );
  if (first.record.generation !== 1 || first.current.result !== "FAIL") {
    fail("self-test: initial FAIL canonical generation was not preserved");
  }

  const second = finalizeEnvironmentConformanceSystemReleaseGate(
    {
      root: redmineRoot,
      runnerRoot,
      handoff,
      evidenceRevision: passRevision,
      evidencePath: rawPathPass,
      evidenceRepository: DEFAULT_EVIDENCE_REPOSITORY,
      output,
      remoteMain: "origin/main",
      replaceExisting: true,
      invalidationReason: "operational environment corrected",
      invalidatingDefectIssueId: null,
      invalidatedAt: "2026-09-25T01:30:00Z",
    },
    { run: fakeRun, schema },
  );

  if (
    second.record.generation !== 2
    || second.current.result !== "PASS"
    || second.record.history[0]?.snapshot?.result !== "FAIL"
    || second.record.supersedes !== second.record.history[0]?.generationId
  ) {
    fail("self-test: FAIL -> PASS generation/history/supersedes closure failed");
  }
  if (second.current.testedSourceRevision !== testedRevision || second.current.evidenceRevision !== passRevision) {
    fail("self-test: testedSourceRevision and evidenceRevision were not kept separate");
  }
  if (second.current.unresolvedMandatoryCoverageGapCount !== 0) {
    fail("self-test: PASS canonical evidence preserved unresolved mandatory coverage");
  }
  if (second.current.productionDeploymentCertification !== false) {
    fail("self-test: host observation was promoted to deployment certification");
  }
  if (!SHA1.test(second.current.evidenceBlobSha)) fail("self-test: evidenceBlobSha is invalid");
  if (!SHA256_ID.test(second.current.rawRecordSha256)) fail("self-test: rawRecordSha256 is invalid");

  let privacyGuard = false;
  try {
    assertRawEnvironmentRecord(
      {
        ...passRawFixture(testedRevision),
        phase50VerifierRecord: {
          sha256: `sha256:${"1".repeat(64)}`,
          record: {
            schemaVersion: 1,
            testedGitRevision: testedRevision,
            generatedAt: "2026-09-25T03:00:00Z",
            findings: [{
              id: "s3.identity",
              surface: "s3",
              requirement: "identity privacy",
              classification: "compatible",
              evidence: ["arn:aws:sts::000000000000:assumed-role/Role/session"],
            }],
          },
        },
      },
      testedRevision,
    );
  } catch {
    privacyGuard = true;
  }
  if (!privacyGuard) fail("self-test: raw AWS identity leak was accepted");

  let deploymentCertificationGuard = false;
  try {
    assertRawEnvironmentRecord(
      { ...passRawFixture(testedRevision), productionDeploymentCertification: true },
      testedRevision,
    );
  } catch {
    deploymentCertificationGuard = true;
  }
  if (!deploymentCertificationGuard) fail("self-test: deployment certification drift was accepted");

  rmSync(temp, { recursive: true, force: true });
  return {
    result: "PASS",
    failGenerationPreserved: "PASS",
    passSupersedesFail: "PASS",
    testedVsEvidenceRevisionSeparated: "PASS",
    rawRecordSha256: "PASS",
    evidenceBlobSha: "PASS",
    evidenceRevisionMainReachability: "PASS",
    unresolvedCoverageClosure: "PASS",
    awsIdentityPrivacy: "PASS",
    hostObservationNotDeploymentCertification: "PASS",
    schemaValidation: "PASS",
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(options.root), null, 2)}\n`);
  } else {
    const finalized = finalizeEnvironmentConformanceSystemReleaseGate(options);
    process.stdout.write(
      `${JSON.stringify({
        result: finalized.current.result,
        generation: finalized.record.generation,
        generationId: finalized.record.generationId,
        testedSourceRevision: finalized.current.testedSourceRevision,
        evidenceRevision: finalized.current.evidenceRevision,
        evidencePath: finalized.current.evidencePath,
        output: options.output,
      }, null, 2)}\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
