#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  artifactPrefix,
  assertCleanCheckout,
  assertDetachedCleanCheckout,
  assertNodeVersionMatchesNvmrc,
  assertOutputOutsideCheckout,
  assertRawEvidenceFilename,
  assertRawRecordPathIsNew,
  assertRealS3EnvironmentOwnership,
  captureExecutionHost,
  classifyAccessDeniedResult,
  defaultRun,
  ensureParentDirectoryExists,
  iamDeleteProbeKey,
  readExpectedAgentRunnerRevision,
  readSanitizedAwsPrincipal,
  requireSuccess,
  runNpmCi,
  runNpmScript,
  sha256Bytes,
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
  if (value === "") fail(`${name} is required for the Phase 52 real S3 Gate`);
  return value;
}

function expectedOwnerArgs(env) {
  const owner = String(env.AGENT_RUNNER_ARTIFACT_S3_EXPECTED_BUCKET_OWNER ?? "").trim();
  return owner === "" ? [] : ["--expected-bucket-owner", owner];
}

function runIamNegativeProbes({ cwd, env, run = defaultRun, now = new Date(), uuid = randomUUID() }) {
  const bucket = requiredEnv(env, "AGENT_RUNNER_ARTIFACT_S3_BUCKET");
  const prefix = artifactPrefix(env);
  const key = iamDeleteProbeKey(env, { now, uuid });
  const ownerArgs = expectedOwnerArgs(env);

  const deleteResult = run(
    "aws",
    [
      "s3api",
      "delete-object",
      "--bucket",
      bucket,
      "--key",
      key,
      ...ownerArgs,
      "--output",
      "json",
    ],
    { cwd, env },
  );
  classifyAccessDeniedResult(deleteResult, "DeleteObject");

  const listResult = run(
    "aws",
    [
      "s3api",
      "list-objects-v2",
      "--bucket",
      bucket,
      "--prefix",
      prefix,
      "--max-items",
      "1",
      ...ownerArgs,
      "--output",
      "json",
    ],
    { cwd, env },
  );
  classifyAccessDeniedResult(listResult, "ListBucket");

  return {
    artifactPrefix: prefix,
    deleteObject: {
      result: "PASS",
      expectedError: "AccessDenied",
      probeKeySha256: `sha256:${sha256Bytes(key)}`,
    },
    listBucket: {
      result: "PASS",
      expectedError: "AccessDenied",
    },
  };
}

function buildVerifierRecordPath(recordOutput) {
  return resolve(`${recordOutput}.phase49-verifier.tmp.json`);
}

function readVerifierRecord(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Phase 49 verifier record is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function runRealS3Gate(options, adapters = {}) {
  const run = adapters.run ?? defaultRun;
  const env = { ...process.env, ...(adapters.env ?? {}) };
  const now = adapters.now ?? new Date();
  const uuid = adapters.uuid ?? randomUUID();

  if (!options.runnerRoot) fail("--runner-root is required");
  if (!options.recordOutput) fail("--record-output is required");

  assertRawEvidenceFilename(options.recordOutput, "real-s3");
  assertOutputOutsideCheckout({ checkoutRoot: options.runnerRoot, outputPath: options.recordOutput });
  ensureParentDirectoryExists(options.recordOutput);
  assertRawRecordPathIsNew(options.recordOutput);
  assertRealS3EnvironmentOwnership(env);
  if (String(env.PHASE49_REAL_S3_IAM_BOUNDARY_CONFIRMED ?? "").toLowerCase() !== "yes") {
    fail("PHASE49_REAL_S3_IAM_BOUNDARY_CONFIRMED=yes is required");
  }

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
    requireDocker: false,
  });
  const awsPrincipal = readSanitizedAwsPrincipal({ cwd: options.runnerRoot, run });
  const iamNegativeVerification = runIamNegativeProbes({
    cwd: options.runnerRoot,
    env,
    run,
    now,
    uuid,
  });

  const verifierRecordPath = buildVerifierRecordPath(options.recordOutput);
  assertOutputOutsideCheckout({ checkoutRoot: options.runnerRoot, outputPath: verifierRecordPath });
  assertRawRecordPathIsNew(verifierRecordPath);

  const gateEnv = {
    ...env,
    PHASE49_REAL_S3_TESTED_GIT_REVISION: testedSourceRevision,
    PHASE49_REAL_S3_VERIFICATION_RECORD: verifierRecordPath,
  };

  try {
    runNpmScript({
      repositoryRoot: options.runnerRoot,
      script: "verify:phase49:s3",
      env: gateEnv,
      run,
    });

    const verifierRecord = readVerifierRecord(verifierRecordPath);
    const verifierRecordSha256 = sha256File(verifierRecordPath);
    assertCleanCheckout({ repositoryRoot: options.runnerRoot, run });

    const record = {
      schemaVersion: 1,
      recordType: "phase52-real-s3-system-release-gate-raw",
      testedSourceRevision,
      executionHost: {
        ...executionHost,
        nodeVersion,
      },
      awsPrincipal,
      iamAttestationResult:
        String(gateEnv.PHASE49_REAL_S3_IAM_BOUNDARY_CONFIRMED ?? "").toLowerCase() === "yes"
          ? "PASS"
          : "FAIL",
      iamNegativeVerification,
      phase49VerifierRecord: {
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
  const temp = mkdtempSync(join(tmpdir(), "phase52-real-s3-selftest-"));
  const redmineRoot = resolve(temp, "redmine");
  const runnerRoot = resolve(temp, "runner");
  const outDir = resolve(temp, "out");
  const expectedRevision = "a".repeat(40);
  const handoffPath = resolve(redmineRoot, "docs/verification/phase51-phase52-handoff.md");
  const outputPath = resolve(outDir, "phase52-real-s3-system-release-20260925T000000Z.json");

  writeFileSync(resolve(temp, "placeholder"), "", "utf8");
  for (const path of [redmineRoot, runnerRoot, outDir, resolve(redmineRoot, "docs"), resolve(redmineRoot, "docs/verification")]) {
    try {
      requireSuccess(defaultRun("mkdir", ["-p", path]), `mkdir ${path}`);
    } catch {
      // Windows is out of scope for the repository runner; container/CI is POSIX.
    }
  }
  writeFileSync(
    handoffPath,
    `- Agent Runner: version \`0.0.0\`, exact source \`${expectedRevision}\`\n`,
    "utf8",
  );
  writeFileSync(resolve(runnerRoot, ".nvmrc"), "24.19.0\n", "utf8");

  const verifierTmp = `${outputPath}.phase49-verifier.tmp.json`;
  const commandLog = [];
  const fakeRun = (command, args, options = {}) => {
    commandLog.push([command, ...args]);
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
    if (joined.startsWith("docker version")) return { status: 127, stdout: "", stderr: "docker not found" };
    if (joined === "aws sts get-caller-identity --output json") {
      return {
        status: 0,
        stdout: JSON.stringify({
          Account: "123456789012",
          Arn: "arn:aws:sts::123456789012:assumed-role/Phase52Role/user@example.com",
        }),
        stderr: "",
      };
    }
    if (joined.startsWith("aws s3api delete-object ")) {
      return { status: 255, stdout: "", stderr: "An error occurred (AccessDenied) when calling DeleteObject" };
    }
    if (joined.startsWith("aws s3api list-objects-v2 ")) {
      return { status: 255, stdout: "", stderr: "An error occurred (AccessDenied) when calling ListObjectsV2" };
    }
    if (joined === "npm run verify:phase49:s3") {
      const target = options.env.PHASE49_REAL_S3_VERIFICATION_RECORD;
      writeFileSync(target, `${JSON.stringify({ result: "PASS", testedGitRevision: expectedRevision })}\n`, "utf8");
      return { status: 0, stdout: "PASS\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };

  const env = {
    AGENT_RUNNER_ARTIFACT_S3_BUCKET: "phase52-selftest-bucket",
    AGENT_RUNNER_ARTIFACT_S3_REGION: "us-east-1",
    AGENT_RUNNER_ARTIFACT_S3_PREFIX: "phase49/artifacts",
    PHASE49_REAL_S3_IAM_BOUNDARY_CONFIRMED: "yes",
    PHASE52_HOST_PROVIDER: "self-test",
  };

  const record = runRealS3Gate(
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
      uuid: "00000000-0000-4000-8000-000000000000",
    },
  );

  if (record.result !== "PASS") fail("self-test: real S3 Gate did not PASS");
  if (record.executionHost.dockerClientVersion !== null) fail("self-test: Docker should be optional for 52-1");
  const serialized = JSON.stringify(record);
  if (serialized.includes("123456789012") || serialized.includes("user@example.com")) {
    fail("self-test: public raw record leaked AWS account/session identity");
  }
  if (!commandLog.some((entry) => entry[0] === "aws" && entry[1] === "s3api" && entry[2] === "delete-object")) {
    fail("self-test: DeleteObject negative probe was not executed");
  }

  let envOwnershipGuard = false;
  try {
    runRealS3Gate(
      {
        root: redmineRoot,
        runnerRoot,
        handoff: handoffPath,
        recordOutput: resolve(outDir, "phase52-real-s3-system-release-20260925T000001Z.json"),
        skipNpmCi: true,
      },
      {
        run: fakeRun,
        env: { ...env, PHASE49_REAL_S3_TESTED_GIT_REVISION: expectedRevision },
      },
    );
  } catch {
    envOwnershipGuard = true;
  }
  if (!envOwnershipGuard) fail("self-test: pre-existing tested revision was not rejected");

  let noSuchBucketGuard = false;
  try {
    classifyAccessDeniedResult(
      { status: 255, stdout: "", stderr: "An error occurred (NoSuchBucket)" },
      "DeleteObject",
    );
  } catch {
    noSuchBucketGuard = true;
  }
  if (!noSuchBucketGuard) fail("self-test: NoSuchBucket was not rejected");

  rmSync(temp, { recursive: true, force: true });
  return {
    result: "PASS",
    exactCheckoutGuard: "PASS",
    optionalDockerEvidence: "PASS",
    testedRevisionOwnership: "PASS",
    awsPrincipalSanitization: "PASS",
    iamAccessDeniedVerification: "PASS",
    noSuchBucketNegativeControl: "PASS",
    rawOutputOutsideCheckout: "PASS",
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  } else {
    const record = runRealS3Gate(options);
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
