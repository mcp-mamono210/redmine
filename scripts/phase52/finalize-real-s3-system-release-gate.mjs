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
import { pathToFileURL } from "node:url";

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
const RAW_RECORD_TYPE = "phase52-real-s3-system-release-gate-raw";
const CANONICAL_RECORD_TYPE = "phase52-real-s3-system-release-gate";
const DEFAULT_EVIDENCE_REPOSITORY = "mcp-mamono210/ai-agent-runner";
const DEFAULT_CANONICAL_PATH = "docs/verification/phase52-real-s3-system-release-gate.json";

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
  assertRawEvidenceFilename(value, "real-s3");
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

function assertSanitizedAwsPrincipal(raw) {
  if (!isObject(raw)) {
    fail("raw evidence awsPrincipal must be an object for a PASS record");
  }
  const keys = Object.keys(raw).sort();
  const allowed = ["normalizedPrincipalArnSha256", "roleName"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(allowed)) {
    fail("raw evidence awsPrincipal contains fields outside the public sanitized identity");
  }
  if (typeof raw.roleName !== "string" || raw.roleName.trim() === "") {
    fail("raw evidence roleName is missing");
  }
  if (!SHA256_ID.test(raw.normalizedPrincipalArnSha256 ?? "")) {
    fail("raw evidence normalizedPrincipalArnSha256 is invalid");
  }
  return raw;
}

function assertPassIamNegativeVerification(raw) {
  if (!isObject(raw)) fail("raw evidence iamNegativeVerification must be an object");
  for (const field of ["deleteObject", "listBucket"]) {
    const value = raw[field];
    if (!isObject(value) || value.result !== "PASS" || value.expectedError !== "AccessDenied") {
      fail(`raw evidence IAM ${field} verification must PASS with AccessDenied`);
    }
  }
  return raw;
}

function assertPhase49VerifierRecord(raw, testedSourceRevision) {
  if (!isObject(raw)) fail("raw evidence phase49VerifierRecord must be an object for a PASS record");
  if (!SHA256_ID.test(raw.sha256 ?? "")) fail("phase49VerifierRecord.sha256 is invalid");
  if (!isObject(raw.record)) fail("phase49VerifierRecord.record must be an object");
  if (raw.record.result !== "PASS") fail("Phase 49 verifier record result must be PASS");
  if (raw.record.testedGitRevision !== testedSourceRevision) {
    fail("Phase 49 verifier testedGitRevision does not match raw testedSourceRevision");
  }
  return raw;
}

function assertRawRealS3Record(raw, expectedTestedRevision) {
  if (!isObject(raw)) fail("raw evidence must be a JSON object");
  if (raw.schemaVersion !== 1) fail("raw evidence schemaVersion must be 1");
  if (raw.recordType !== RAW_RECORD_TYPE) fail(`raw evidence recordType must be ${RAW_RECORD_TYPE}`);
  if (raw.result !== "PASS" && raw.result !== "FAIL") fail("raw evidence result must be PASS or FAIL");
  if (typeof raw.verifiedAt !== "string" || raw.verifiedAt.trim() === "") {
    fail("raw evidence verifiedAt is required");
  }

  if (raw.result === "PASS") {
    if (!FULL_GIT_REVISION.test(raw.testedSourceRevision ?? "")) {
      fail("PASS raw evidence testedSourceRevision must be a full Git revision");
    }
    if (raw.testedSourceRevision !== expectedTestedRevision) {
      fail("PASS raw evidence testedSourceRevision does not match Phase 51 handoff exact RC");
    }
    if (!isObject(raw.executionHost)) fail("PASS raw evidence executionHost is required");
    assertSanitizedAwsPrincipal(raw.awsPrincipal);
    if (raw.iamAttestationResult !== "PASS") fail("PASS raw evidence IAM attestation must be PASS");
    assertPassIamNegativeVerification(raw.iamNegativeVerification);
    assertPhase49VerifierRecord(raw.phase49VerifierRecord, raw.testedSourceRevision);
    if (raw.checkoutClean === false) fail("PASS raw evidence cannot report a dirty post-run checkout");
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
    if (raw.awsPrincipal !== null && raw.awsPrincipal !== undefined) {
      assertSanitizedAwsPrincipal(raw.awsPrincipal);
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
  return {
    testedSourceRevision: raw.testedSourceRevision,
    evidenceRepository,
    evidenceRevision,
    evidencePath,
    evidenceBlobSha,
    rawRecordSha256,
    executionHost: raw.executionHost ?? null,
    roleName: raw.awsPrincipal?.roleName ?? null,
    normalizedPrincipalArnSha256: raw.awsPrincipal?.normalizedPrincipalArnSha256 ?? null,
    iamAttestationResult: raw.iamAttestationResult ?? null,
    iamNegativeVerificationResult: raw.iamNegativeVerification ?? null,
    phase49VerifierRecordSha256: raw.phase49VerifierRecord?.sha256 ?? null,
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
      fail("canonical Phase 52 real S3 Gate evidence already exists; use --replace-existing for a new generation");
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

export function finalizeRealS3SystemReleaseGate(options, adapters = {}) {
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
  assertRawRealS3Record(raw, expectedTestedRevision);

  const current = buildCurrent({
    raw,
    evidenceRepository,
    evidenceRevision: options.evidenceRevision,
    evidencePath,
    evidenceBlobSha,
    rawRecordSha256: `sha256:${sha256Bytes(rawText)}`,
  });
  const canonical = persistCanonicalRecord(options, current, schema);

  return {
    record: canonical,
    current,
  };
}

function rawFixture({ testedRevision, result, verifiedAt }) {
  const base = {
    schemaVersion: 1,
    recordType: RAW_RECORD_TYPE,
    testedSourceRevision: testedRevision,
    executionHost: {
      hostProvider: "self-test",
      uname: { sysname: "Linux", kernelRelease: "self-test", machine: "x86_64" },
      nodeVersion: "v24.19.0",
      npmVersion: "11.0.0",
      awsCliVersion: "aws-cli/2.selftest",
      dockerClientVersion: null,
      dockerServerVersion: null,
    },
    awsPrincipal: {
      roleName: "Phase52Role",
      normalizedPrincipalArnSha256: `sha256:${"1".repeat(64)}`,
    },
    iamAttestationResult: "PASS",
    iamNegativeVerification: {
      artifactPrefix: "phase49/artifacts",
      deleteObject: {
        result: "PASS",
        expectedError: "AccessDenied",
        probeKeySha256: `sha256:${"2".repeat(64)}`,
      },
      listBucket: { result: "PASS", expectedError: "AccessDenied" },
    },
    phase49VerifierRecord: {
      sha256: `sha256:${"3".repeat(64)}`,
      record: { result: "PASS", testedGitRevision: testedRevision },
    },
    checkoutClean: true,
    result,
    verifiedAt,
  };
  if (result === "FAIL") {
    return {
      ...base,
      failure: { stage: "phase49-verifier", message: "self-test failure" },
    };
  }
  return base;
}

function runSelfTest(root) {
  const temp = mkdtempSync(join(tmpdir(), "phase52-real-s3-finalize-selftest-"));
  const redmineRoot = resolve(temp, "redmine");
  const runnerRoot = resolve(temp, "runner");
  const handoff = resolve(redmineRoot, "docs/verification/phase51-phase52-handoff.md");
  const output = resolve(redmineRoot, DEFAULT_CANONICAL_PATH);
  mkdirSync(dirname(handoff), { recursive: true });
  mkdirSync(runnerRoot, { recursive: true });

  const testedRevision = "a".repeat(40);
  const failRevision = "b".repeat(40);
  const passRevision = "c".repeat(40);
  const rawPathFail = "docs/verification/phase52-real-s3-system-release-20260925T010000Z.json";
  const rawPathPass = "docs/verification/phase52-real-s3-system-release-20260925T020000Z.json";
  const rawFail = `${JSON.stringify(rawFixture({
    testedRevision,
    result: "FAIL",
    verifiedAt: "2026-09-25T01:00:00Z",
  }), null, 2)}\n`;
  const rawPass = `${JSON.stringify(rawFixture({
    testedRevision,
    result: "PASS",
    verifiedAt: "2026-09-25T02:00:00Z",
  }), null, 2)}\n`;
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
    if (joined === `git -C ${runnerRoot} cat-file -e ${failRevision}^{commit}`) {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === `git -C ${runnerRoot} cat-file -e ${passRevision}^{commit}`) {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === `git -C ${runnerRoot} merge-base --is-ancestor ${failRevision} origin/main`) {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === `git -C ${runnerRoot} merge-base --is-ancestor ${passRevision} origin/main`) {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === `git -C ${runnerRoot} rev-parse ${failRevision}:${rawPathFail}`) {
      return { status: 0, stdout: `${"d".repeat(40)}\n`, stderr: "" };
    }
    if (joined === `git -C ${runnerRoot} rev-parse ${passRevision}:${rawPathPass}`) {
      return { status: 0, stdout: `${"e".repeat(40)}\n`, stderr: "" };
    }
    if (command === "git" && args[2] === "show") {
      const raw = rawByRevision.get(args[3]);
      if (raw !== undefined) return { status: 0, stdout: raw, stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };

  const schema = readPhase52Schema(root);
  const first = finalizeRealS3SystemReleaseGate(
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

  const second = finalizeRealS3SystemReleaseGate(
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
  if (second.current.evidenceRevision !== passRevision) {
    fail("self-test: evidenceRevision was not kept separate from testedSourceRevision");
  }
  if (second.current.testedSourceRevision !== testedRevision) {
    fail("self-test: testedSourceRevision changed during evidence commit finalization");
  }
  if (!SHA1.test(second.current.evidenceBlobSha)) fail("self-test: evidenceBlobSha is invalid");
  if (!SHA256_ID.test(second.current.rawRecordSha256)) fail("self-test: rawRecordSha256 is invalid");

  let unreachableGuard = false;
  const unreachableRevision = "f".repeat(40);
  try {
    finalizeRealS3SystemReleaseGate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff,
        evidenceRevision: unreachableRevision,
        evidencePath: rawPathPass,
        evidenceRepository: DEFAULT_EVIDENCE_REPOSITORY,
        output: resolve(redmineRoot, "docs/verification/unreachable.json"),
        remoteMain: "origin/main",
        replaceExisting: false,
        invalidationReason: null,
        invalidatingDefectIssueId: null,
        invalidatedAt: null,
      },
      {
        schema,
        run: (command, args) => {
          const joined = `${command} ${args.join(" ")}`;
          if (joined === `git -C ${runnerRoot} cat-file -e ${unreachableRevision}^{commit}`) {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (joined === `git -C ${runnerRoot} merge-base --is-ancestor ${unreachableRevision} origin/main`) {
            return { status: 1, stdout: "", stderr: "" };
          }
          return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
        },
      },
    );
  } catch {
    unreachableGuard = true;
  }
  if (!unreachableGuard) fail("self-test: non-main-reachable evidenceRevision was accepted");

  let rawIdentityGuard = false;
  try {
    assertRawRealS3Record(
      {
        ...rawFixture({ testedRevision, result: "PASS", verifiedAt: "2026-09-25T03:00:00Z" }),
        phase49VerifierRecord: {
          sha256: `sha256:${"3".repeat(64)}`,
          record: { result: "PASS", testedGitRevision: "9".repeat(40) },
        },
      },
      testedRevision,
    );
  } catch {
    rawIdentityGuard = true;
  }
  if (!rawIdentityGuard) fail("self-test: Phase 49 verifier tested revision mismatch was accepted");

  let privacyGuard = false;
  try {
    assertRawRealS3Record(
      {
        ...rawFixture({ testedRevision, result: "PASS", verifiedAt: "2026-09-25T03:00:00Z" }),
        awsPrincipal: {
          roleName: "Phase52Role",
          normalizedPrincipalArnSha256: `sha256:${"1".repeat(64)}`,
          Account: "123456789012",
        },
      },
      testedRevision,
    );
  } catch {
    privacyGuard = true;
  }
  if (!privacyGuard) fail("self-test: raw AWS account identity was accepted");

  rmSync(temp, { recursive: true, force: true });
  return {
    result: "PASS",
    failGenerationPreserved: "PASS",
    passSupersedesFail: "PASS",
    testedVsEvidenceRevisionSeparated: "PASS",
    rawRecordSha256: "PASS",
    evidenceBlobSha: "PASS",
    evidenceRevisionMainReachability: "PASS",
    phase49VerifierIdentity: "PASS",
    awsIdentityPrivacy: "PASS",
    schemaValidation: "PASS",
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(options.root), null, 2)}\n`);
  } else {
    const finalized = finalizeRealS3SystemReleaseGate(options);
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
