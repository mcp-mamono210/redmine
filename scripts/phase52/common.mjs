#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const FULL_GIT_REVISION = /^[0-9a-f]{40,64}$/u;
const PHASE52_RECORD_TYPES = Object.freeze([
  "phase52-real-s3-system-release-gate",
  "phase52-environment-conformance-system-release-gate",
  "v0.4.0-system-release",
]);

const FROZEN_EXACT_PATHS = new Set([
  ".nvmrc",
  ".node-version",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
]);

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

export function defaultRun(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? 1,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export function requireSuccess(result, label) {
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    const suffix = stderr === "" ? "" : `: ${stderr}`;
    fail(`${label} failed${suffix}`);
  }
  return String(result.stdout ?? "");
}

export function canonicalGenerationPayload(recordType, generation, current) {
  return JSON.stringify({ recordType, generation, current });
}

export function generationId(recordType, generation, current) {
  return `sha256:${createHash("sha256")
    .update(canonicalGenerationPayload(recordType, generation, current), "utf8")
    .digest("hex")}`;
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function utcTimestampForFilename(date = new Date()) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

export function rawEvidenceFilename(kind, date = new Date()) {
  const timestamp = utcTimestampForFilename(date);
  if (kind === "real-s3") {
    return `phase52-real-s3-system-release-${timestamp}.json`;
  }
  if (kind === "environment-conformance") {
    return `phase52-environment-conformance-system-release-${timestamp}.json`;
  }
  fail(`Unknown raw evidence kind: ${String(kind)}`);
}

export function assertRawEvidenceFilename(path, kind) {
  const name = normalizeSlashes(path).split("/").at(-1) ?? "";
  const patterns = {
    "real-s3": /^phase52-real-s3-system-release-\d{8}T\d{6}Z\.json$/u,
    "environment-conformance": /^phase52-environment-conformance-system-release-\d{8}T\d{6}Z\.json$/u,
  };
  const pattern = patterns[kind];
  if (!pattern) fail(`Unknown raw evidence kind: ${String(kind)}`);
  if (!pattern.test(name)) {
    fail(`raw evidence filename does not match Phase 52 immutable timestamp rule: ${name}`);
  }
  return name;
}

export function writeJsonExclusive(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export function makeInitialEvidenceRecord(recordType, current) {
  if (!PHASE52_RECORD_TYPES.includes(recordType)) {
    fail(`Unsupported Phase 52 recordType: ${recordType}`);
  }
  const generation = 1;
  return {
    schemaVersion: 1,
    recordType,
    generation,
    generationId: generationId(recordType, generation, current),
    current,
    history: [],
    supersedes: null,
  };
}

export function makeReentryEvidenceRecord(existing, current, metadata) {
  validateEvidenceEnvelope(existing);
  const invalidationReason = String(metadata?.invalidationReason ?? "").trim();
  if (invalidationReason === "") fail("re-entry requires invalidationReason");
  const invalidatedAt = metadata?.invalidatedAt ?? new Date().toISOString();
  if (!RFC3339.test(invalidatedAt)) fail("invalidatedAt must be RFC3339");
  const invalidatingDefectIssueId = metadata?.invalidatingDefectIssueId ?? null;
  if (
    invalidatingDefectIssueId !== null
    && (!Number.isInteger(invalidatingDefectIssueId) || invalidatingDefectIssueId < 1)
  ) {
    fail("invalidatingDefectIssueId must be a positive integer or null");
  }

  const generation = existing.generation + 1;
  const historyEntry = {
    generation: existing.generation,
    generationId: existing.generationId,
    snapshot: existing.current,
    invalidatedAt,
    invalidationReason,
    invalidatingDefectIssueId,
  };

  return {
    schemaVersion: 1,
    recordType: existing.recordType,
    generation,
    generationId: generationId(existing.recordType, generation, current),
    current,
    history: [...existing.history, historyEntry],
    supersedes: existing.generationId,
  };
}

export function validateEvidenceEnvelope(record) {
  if (!isObject(record)) fail("evidence record must be an object");
  if (record.schemaVersion !== 1) fail("Phase 52 evidence schemaVersion must be 1");
  if (!PHASE52_RECORD_TYPES.includes(record.recordType)) {
    fail(`unsupported Phase 52 recordType: ${String(record.recordType)}`);
  }
  if (!Number.isInteger(record.generation) || record.generation < 1) {
    fail("evidence generation must be a positive integer");
  }
  if (!SHA256_ID.test(record.generationId ?? "")) {
    fail("evidence generationId format is invalid");
  }
  if (!isObject(record.current)) fail("evidence current must be an object");
  if (!Array.isArray(record.history)) fail("evidence history must be an array");
  if (record.supersedes !== null && !SHA256_ID.test(record.supersedes ?? "")) {
    fail("evidence supersedes format is invalid");
  }

  const expectedCurrentId = generationId(
    record.recordType,
    record.generation,
    record.current,
  );
  if (record.generationId !== expectedCurrentId) {
    fail("evidence generationId does not match recordType + generation + current");
  }

  if (record.history.length !== record.generation - 1) {
    fail("evidence history length must equal generation - 1");
  }

  for (let index = 0; index < record.history.length; index += 1) {
    const entry = record.history[index];
    const expectedGeneration = index + 1;
    if (!isObject(entry)) fail(`history[${index}] must be an object`);
    if (entry.generation !== expectedGeneration) {
      fail(`history[${index}] generation must be ${expectedGeneration}`);
    }
    if (!SHA256_ID.test(entry.generationId ?? "")) {
      fail(`history[${index}] generationId format is invalid`);
    }
    if (!isObject(entry.snapshot)) fail(`history[${index}] snapshot must be an object`);
    const expectedId = generationId(record.recordType, entry.generation, entry.snapshot);
    if (entry.generationId !== expectedId) {
      fail(`history[${index}] generationId does not match snapshot`);
    }
    if (!RFC3339.test(entry.invalidatedAt ?? "")) {
      fail(`history[${index}] invalidatedAt must be RFC3339`);
    }
    if (typeof entry.invalidationReason !== "string" || entry.invalidationReason.trim() === "") {
      fail(`history[${index}] invalidationReason must be non-empty`);
    }
    if (
      entry.invalidatingDefectIssueId !== null
      && (!Number.isInteger(entry.invalidatingDefectIssueId) || entry.invalidatingDefectIssueId < 1)
    ) {
      fail(`history[${index}] invalidatingDefectIssueId is invalid`);
    }
  }

  if (record.generation === 1) {
    if (record.supersedes !== null) fail("generation 1 evidence must not supersede another record");
  } else {
    const previous = record.history.at(-1);
    if (record.supersedes !== previous?.generationId) {
      fail("evidence supersedes must reference the immediately previous generationId");
    }
  }

  return record;
}

function typeMatches(value, type) {
  switch (type) {
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: fail(`Unsupported schema type: ${String(type)}`);
  }
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/$defs/")) fail(`Unsupported schema $ref: ${ref}`);
  const key = ref.slice("#/$defs/".length);
  const target = rootSchema.$defs?.[key];
  if (!target) fail(`Unknown schema $ref: ${ref}`);
  return target;
}

export function validateJsonSchema(value, schema, rootSchema = schema, path = "$") {
  if (schema.$ref) {
    return validateJsonSchema(value, resolveRef(rootSchema, schema.$ref), rootSchema, path);
  }

  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    fail(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    fail(`${path}: value is not in enum`);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      fail(`${path}: expected type ${types.join("|")}`);
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      fail(`${path}: does not match ${schema.pattern}`);
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    fail(`${path}: smaller than minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) fail(`${path}: duplicate array items`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateJsonSchema(item, schema.items, rootSchema, `${path}[${index}]`));
    }
  }

  if (isObject(value)) {
    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) fail(`${path}: missing required property ${key}`);
    }

    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) fail(`${path}: unknown property ${key}`);
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateJsonSchema(value[key], childSchema, rootSchema, `${path}.${key}`);
      }
    }
  }
}

export function validateEvidenceAgainstSchema(record, schema) {
  validateJsonSchema(record, schema);
  validateEvidenceEnvelope(record);
  return record;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readPhase52Schema(root) {
  return readJson(resolve(root, "docs/verification/phase52-system-release-evidence.schema.json"));
}

export function extractAgentRunnerRevisionFromHandoff(text) {
  const match = text.match(/Agent Runner:\s+version\s+`[^`]+`,\s+exact source\s+`([0-9a-f]{40,64})`/u);
  if (!match) fail("Phase 51 handoff does not contain an Agent Runner exact source revision");
  return match[1];
}

export function readExpectedAgentRunnerRevision(handoffPath) {
  return extractAgentRunnerRevisionFromHandoff(readFileSync(handoffPath, "utf8"));
}

export function assertDetachedCleanCheckout({
  repositoryRoot,
  expectedRevision,
  run = defaultRun,
}) {
  if (!FULL_GIT_REVISION.test(expectedRevision)) fail("expectedRevision must be a full Git revision");

  const head = requireSuccess(
    run("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { cwd: repositoryRoot }),
    "git rev-parse HEAD",
  ).trim();
  if (head !== expectedRevision) {
    fail(`checkout revision mismatch: expected ${expectedRevision}, got ${head}`);
  }

  const symbolic = run("git", ["-C", repositoryRoot, "symbolic-ref", "-q", "HEAD"], {
    cwd: repositoryRoot,
  });
  if (symbolic.status === 0) {
    fail("Agent Runner Gate checkout must be detached");
  }
  if (symbolic.status !== 1) {
    fail("failed to determine whether Agent Runner Gate checkout is detached");
  }

  const status = requireSuccess(
    run("git", ["-C", repositoryRoot, "status", "--porcelain"], { cwd: repositoryRoot }),
    "git status --porcelain",
  ).trim();
  if (status !== "") fail("Agent Runner Gate checkout must be clean");

  return head;
}

export function assertCleanCheckout({ repositoryRoot, run = defaultRun }) {
  const status = requireSuccess(
    run("git", ["-C", repositoryRoot, "status", "--porcelain"], { cwd: repositoryRoot }),
    "git status --porcelain",
  ).trim();
  if (status !== "") fail("Agent Runner Gate checkout must be clean");
}

function normalizeNodeVersion(value) {
  return value.trim().replace(/^v/u, "");
}

export function assertNodeVersionMatchesNvmrc({ repositoryRoot, run = defaultRun }) {
  const nvmrcPath = resolve(repositoryRoot, ".nvmrc");
  if (!existsSync(nvmrcPath)) fail("Agent Runner exact checkout is missing .nvmrc");
  const expected = normalizeNodeVersion(readFileSync(nvmrcPath, "utf8"));
  const actual = normalizeNodeVersion(
    requireSuccess(run("node", ["--version"], { cwd: repositoryRoot }), "node --version"),
  );
  if (actual !== expected) {
    fail(`Node version mismatch: expected ${expected} from .nvmrc, got ${actual}`);
  }
  return actual;
}

export function assertOutputOutsideCheckout({ checkoutRoot, outputPath }) {
  const root = resolve(checkoutRoot);
  const output = resolve(outputPath);
  const rel = relative(root, output);
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside) {
    fail(`Phase 52 raw evidence output must be outside exact RC checkout: ${output}`);
  }
  return output;
}

export function assertRealS3EnvironmentOwnership(env) {
  if (String(env.PHASE49_REAL_S3_TESTED_GIT_REVISION ?? "").trim() !== "") {
    fail("PHASE49_REAL_S3_TESTED_GIT_REVISION must be unset; Phase 52 runner owns tested revision");
  }
}

export function assertEnvironmentConformanceOwnership(env) {
  if (String(env.PHASE50_TESTED_GIT_REVISION ?? "").trim() !== "") {
    fail("PHASE50_TESTED_GIT_REVISION must be unset for Phase 52");
  }
  if (String(env.PHASE50_S3_CONFORMANCE_ENDPOINT ?? "").trim() !== "") {
    fail("PHASE50_S3_CONFORMANCE_ENDPOINT must be unset; Phase 52 requires AWS S3");
  }
}

export function sanitizeAwsPrincipal(identity) {
  if (!isObject(identity) || typeof identity.Arn !== "string") {
    fail("aws sts get-caller-identity did not return Arn");
  }

  const arn = identity.Arn;
  const assumed = arn.match(/^arn:([^:]+):sts::[^:]+:assumed-role\/(.+)\/([^/]+)$/u);
  if (assumed) {
    const partition = assumed[1];
    const roleName = assumed[2];
    const normalized = `arn:${partition}:sts::REDACTED:assumed-role/${roleName}`;
    return {
      roleName,
      normalizedPrincipalArnSha256: `sha256:${sha256Bytes(normalized)}`,
    };
  }

  const role = arn.match(/^arn:([^:]+):iam::[^:]+:role\/(.+)$/u);
  if (role) {
    const partition = role[1];
    const roleName = role[2];
    const normalized = `arn:${partition}:iam::REDACTED:role/${roleName}`;
    return {
      roleName,
      normalizedPrincipalArnSha256: `sha256:${sha256Bytes(normalized)}`,
    };
  }

  fail("Phase 52 requires an AWS role principal; user/session identity is not accepted for public evidence");
}

export function classifyAccessDeniedResult(result, operation) {
  const combined = `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`;
  if (result.status === 0) fail(`${operation} unexpectedly succeeded`);
  if (/NoSuchBucket/iu.test(combined)) fail(`${operation} failed with NoSuchBucket, not AccessDenied`);
  if (/NoSuchKey/iu.test(combined)) fail(`${operation} failed with NoSuchKey, not AccessDenied`);
  if (/timeout|timed out|could not connect|network|name or service not known|temporary failure/iu.test(combined)) {
    fail(`${operation} failed due to network/timeout, not AccessDenied`);
  }
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken|UnrecognizedClient|InvalidClientTokenId/iu.test(combined)) {
    fail(`${operation} failed due to authentication, not AccessDenied`);
  }
  if (!/\bAccessDenied\b/u.test(combined)) {
    fail(`${operation} did not fail with AccessDenied`);
  }
  return "PASS";
}

export function artifactPrefix(env) {
  const configured = String(env.AGENT_RUNNER_ARTIFACT_S3_PREFIX ?? "").trim();
  const prefix = configured === "" ? "phase49/artifacts" : configured;
  return prefix.replace(/^\/+|\/+$/gu, "");
}

export function iamDeleteProbeKey(env, { now = new Date(), uuid = randomUUID() } = {}) {
  const prefix = artifactPrefix(env);
  return `${prefix}/phase52-iam-negative/${utcTimestampForFilename(now)}-${uuid}.probe`;
}

function commandVersion(run, command, args, cwd, required) {
  const result = run(command, args, { cwd });
  if (result.status !== 0) {
    if (required) fail(`${command} version is required but unavailable`);
    return null;
  }
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  return stdout !== "" ? stdout : stderr;
}

export function captureExecutionHost({
  cwd,
  env = process.env,
  run = defaultRun,
  requireDocker = false,
}) {
  const hostProvider = String(env.PHASE52_HOST_PROVIDER ?? "unknown").trim() || "unknown";
  const dockerClient = commandVersion(run, "docker", ["version", "--format", "{{.Client.Version}}"], cwd, requireDocker);
  const dockerServer = commandVersion(run, "docker", ["version", "--format", "{{.Server.Version}}"], cwd, requireDocker);

  return {
    hostProvider,
    uname: {
      sysname: commandVersion(run, "uname", ["-s"], cwd, true),
      kernelRelease: commandVersion(run, "uname", ["-r"], cwd, true),
      machine: commandVersion(run, "uname", ["-m"], cwd, true),
    },
    nodeVersion: commandVersion(run, "node", ["--version"], cwd, true),
    npmVersion: commandVersion(run, "npm", ["--version"], cwd, true),
    awsCliVersion: commandVersion(run, "aws", ["--version"], cwd, true),
    dockerClientVersion: dockerClient,
    dockerServerVersion: dockerServer,
  };
}

export function readSanitizedAwsPrincipal({ cwd, run = defaultRun }) {
  const result = run("aws", ["sts", "get-caller-identity", "--output", "json"], { cwd });
  const raw = requireSuccess(result, "aws sts get-caller-identity");
  let identity;
  try {
    identity = JSON.parse(raw);
  } catch {
    fail("aws sts get-caller-identity returned invalid JSON");
  }
  return sanitizeAwsPrincipal(identity);
}

export function isReleaseFreezePath(path) {
  const normalized = normalizeSlashes(path).replace(/^\.\//u, "");
  if (FROZEN_EXACT_PATHS.has(normalized)) return true;
  if (normalized.startsWith("src/")) return true;
  if (normalized.startsWith("docs/contracts/")) return true;
  if (/^tsconfig(?:\.[^/]+)?\.json$/u.test(normalized)) return true;
  if (/^(?:Dockerfile(?:\.[^/]+)?|docker\/)/u.test(normalized)) return true;
  if (/^(?:config|configs|schemas|assets)\//u.test(normalized)) return true;
  return false;
}

export function classifyReleaseFreezePaths(paths) {
  const normalized = paths
    .map((path) => normalizeSlashes(path).trim())
    .filter((path) => path !== "");
  return {
    frozen: normalized.filter(isReleaseFreezePath),
    allowed: normalized.filter((path) => !isReleaseFreezePath(path)),
  };
}

export function assertNoReleaseFreezeViolations(paths) {
  const classified = classifyReleaseFreezePaths(paths);
  if (classified.frozen.length > 0) {
    fail(`release freeze violation: ${classified.frozen.join(", ")}`);
  }
  return classified;
}

export function gitChangedPaths({ repositoryRoot, baseRevision, head = "HEAD", run = defaultRun }) {
  const stdout = requireSuccess(
    run("git", ["-C", repositoryRoot, "diff", "--name-only", `${baseRevision}..${head}`], {
      cwd: repositoryRoot,
    }),
    "git diff --name-only",
  );
  return stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

export function assertEvidenceRevisionReachableFromMain({
  repositoryRoot,
  evidenceRevision,
  remoteMain = "origin/main",
  run = defaultRun,
}) {
  if (!FULL_GIT_REVISION.test(evidenceRevision)) fail("evidenceRevision must be a full Git revision");
  const exists = run("git", ["-C", repositoryRoot, "cat-file", "-e", `${evidenceRevision}^{commit}`], {
    cwd: repositoryRoot,
  });
  if (exists.status !== 0) fail("evidenceRevision commit is not available locally");

  const ancestor = run(
    "git",
    ["-C", repositoryRoot, "merge-base", "--is-ancestor", evidenceRevision, remoteMain],
    { cwd: repositoryRoot },
  );
  if (ancestor.status !== 0) {
    fail(`evidenceRevision is not reachable from ${remoteMain}`);
  }
  return evidenceRevision;
}

export function gitBlobShaAtRevision({
  repositoryRoot,
  revision,
  path,
  run = defaultRun,
}) {
  if (!FULL_GIT_REVISION.test(revision)) fail("revision must be a full Git revision");
  const normalizedPath = normalizeSlashes(path).replace(/^\.\//u, "");
  const sha = requireSuccess(
    run("git", ["-C", repositoryRoot, "rev-parse", `${revision}:${normalizedPath}`], {
      cwd: repositoryRoot,
    }),
    "git rev-parse revision:path",
  ).trim();
  if (!SHA1.test(sha)) fail("evidence path did not resolve to a Git blob SHA-1");
  return sha;
}

export function runNpmCi({ repositoryRoot, env = process.env, run = defaultRun }) {
  const result = run("npm", ["ci"], { cwd: repositoryRoot, env });
  requireSuccess(result, "npm ci");
}

export function runNpmScript({ repositoryRoot, script, env = process.env, run = defaultRun }) {
  const result = run("npm", ["run", script], { cwd: repositoryRoot, env });
  requireSuccess(result, `npm run ${script}`);
}

export function assertRawRecordPathIsNew(path) {
  if (existsSync(path)) fail(`raw evidence path already exists: ${path}`);
  return path;
}

export function ensureParentDirectoryExists(path) {
  const parent = dirname(resolve(path));
  if (!existsSync(parent)) fail(`raw evidence parent directory does not exist: ${parent}`);
}

function fakeRunFactory(map) {
  return (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    return map[key] ?? { status: 1, stdout: "", stderr: `unexpected command: ${key}` };
  };
}

export function runCommonSelfTest() {
  const current = { result: "FAIL", testedSourceRevision: "a".repeat(40) };
  const initial = makeInitialEvidenceRecord("phase52-real-s3-system-release-gate", current);
  validateEvidenceEnvelope(initial);
  const second = makeReentryEvidenceRecord(
    initial,
    { ...current, result: "PASS" },
    {
      invalidationReason: "operational retry",
      invalidatedAt: "2026-09-25T00:00:00Z",
      invalidatingDefectIssueId: null,
    },
  );
  validateEvidenceEnvelope(second);

  let generationGuard = false;
  try {
    validateEvidenceEnvelope({ ...second, generationId: `sha256:${"0".repeat(64)}` });
  } catch {
    generationGuard = true;
  }
  if (!generationGuard) fail("self-test: generationId mismatch was not rejected");

  let historyGuard = false;
  try {
    validateEvidenceEnvelope({ ...second, supersedes: `sha256:${"0".repeat(64)}` });
  } catch {
    historyGuard = true;
  }
  if (!historyGuard) fail("self-test: broken supersedes chain was not rejected");

  const expected = "b".repeat(40);
  const cleanDetachedRun = fakeRunFactory({
    [`git -C /runner rev-parse HEAD`]: { status: 0, stdout: `${expected}\n`, stderr: "" },
    [`git -C /runner symbolic-ref -q HEAD`]: { status: 1, stdout: "", stderr: "" },
    [`git -C /runner status --porcelain`]: { status: 0, stdout: "", stderr: "" },
  });
  assertDetachedCleanCheckout({ repositoryRoot: "/runner", expectedRevision: expected, run: cleanDetachedRun });

  let wrongHeadGuard = false;
  try {
    assertDetachedCleanCheckout({
      repositoryRoot: "/runner",
      expectedRevision: expected,
      run: fakeRunFactory({
        [`git -C /runner rev-parse HEAD`]: { status: 0, stdout: `${"c".repeat(40)}\n`, stderr: "" },
      }),
    });
  } catch {
    wrongHeadGuard = true;
  }
  if (!wrongHeadGuard) fail("self-test: wrong HEAD was not rejected");

  let dirtyGuard = false;
  try {
    assertDetachedCleanCheckout({
      repositoryRoot: "/runner",
      expectedRevision: expected,
      run: fakeRunFactory({
        [`git -C /runner rev-parse HEAD`]: { status: 0, stdout: `${expected}\n`, stderr: "" },
        [`git -C /runner symbolic-ref -q HEAD`]: { status: 1, stdout: "", stderr: "" },
        [`git -C /runner status --porcelain`]: { status: 0, stdout: " M src/index.ts\n", stderr: "" },
      }),
    });
  } catch {
    dirtyGuard = true;
  }
  if (!dirtyGuard) fail("self-test: dirty worktree was not rejected");

  let outputGuard = false;
  try {
    assertOutputOutsideCheckout({ checkoutRoot: "/runner", outputPath: "/runner/docs/verification/x.json" });
  } catch {
    outputGuard = true;
  }
  if (!outputGuard) fail("self-test: output inside checkout was not rejected");

  let phase49EnvGuard = false;
  try {
    assertRealS3EnvironmentOwnership({ PHASE49_REAL_S3_TESTED_GIT_REVISION: expected });
  } catch {
    phase49EnvGuard = true;
  }
  if (!phase49EnvGuard) fail("self-test: pre-existing Phase 49 tested revision was not rejected");

  let phase50RevisionGuard = false;
  try {
    assertEnvironmentConformanceOwnership({ PHASE50_TESTED_GIT_REVISION: expected });
  } catch {
    phase50RevisionGuard = true;
  }
  if (!phase50RevisionGuard) fail("self-test: PHASE50_TESTED_GIT_REVISION was not rejected");

  let phase50EndpointGuard = false;
  try {
    assertEnvironmentConformanceOwnership({ PHASE50_S3_CONFORMANCE_ENDPOINT: "http://minio:9000" });
  } catch {
    phase50EndpointGuard = true;
  }
  if (!phase50EndpointGuard) fail("self-test: Phase 50 alternate S3 endpoint was not rejected");

  const sanitized = sanitizeAwsPrincipal({
    Account: "123456789012",
    Arn: "arn:aws:sts::123456789012:assumed-role/Phase52ReleaseRole/user@example.com",
  });
  const sanitizedText = JSON.stringify(sanitized);
  if (sanitizedText.includes("123456789012") || sanitizedText.includes("user@example.com")) {
    fail("self-test: sanitized AWS principal leaked account/session identity");
  }

  if (classifyAccessDeniedResult({ status: 255, stdout: "", stderr: "An error occurred (AccessDenied)" }, "DeleteObject") !== "PASS") {
    fail("self-test: AccessDenied was not accepted");
  }

  for (const result of [
    { status: 0, stdout: "{}", stderr: "" },
    { status: 255, stdout: "", stderr: "An error occurred (NoSuchBucket)" },
    { status: 255, stdout: "", stderr: "Could not connect to the endpoint URL" },
  ]) {
    let rejected = false;
    try {
      classifyAccessDeniedResult(result, "DeleteObject");
    } catch {
      rejected = true;
    }
    if (!rejected) fail("self-test: non-AccessDenied IAM result was not rejected");
  }

  const nodeTemp = mkdtempSync(join(tmpdir(), "phase52-common-node-selftest-"));
  writeFileSync(resolve(nodeTemp, ".nvmrc"), "24.19.0\n", "utf8");
  let wrongNodeVersionGuard = false;
  try {
    assertNodeVersionMatchesNvmrc({
      repositoryRoot: nodeTemp,
      run: () => ({ status: 0, stdout: "v24.18.0\n", stderr: "" }),
    });
  } catch {
    wrongNodeVersionGuard = true;
  }
  rmSync(nodeTemp, { recursive: true, force: true });
  if (!wrongNodeVersionGuard) fail("self-test: wrong Node version was not rejected");

  let immutableFilenameGuard = false;
  try {
    assertRawEvidenceFilename("phase52-real-s3-system-release-20260925.json", "real-s3");
  } catch {
    immutableFilenameGuard = true;
  }
  if (!immutableFilenameGuard) fail("self-test: non-timestamp raw filename was not rejected");

  const blobRevision = "d".repeat(40);
  const blobSha = "e".repeat(40);
  const blobRun = fakeRunFactory({
    [`git -C /repo rev-parse ${blobRevision}:docs/verification/raw.json`]: {
      status: 0,
      stdout: `${blobSha}\n`,
      stderr: "",
    },
  });
  if (gitBlobShaAtRevision({
    repositoryRoot: "/repo",
    revision: blobRevision,
    path: "docs/verification/raw.json",
    run: blobRun,
  }) !== blobSha) {
    fail("self-test: evidence Git blob identity lookup drift");
  }

  const freeze = classifyReleaseFreezePaths([
    "src/controller.ts",
    "docs/contracts/example.md",
    "tsconfig.json",
    "docs/verification/phase52.json",
  ]);
  if (freeze.frozen.length !== 3 || freeze.allowed.length !== 1) {
    fail("self-test: release freeze classification drift");
  }

  const reachableRun = fakeRunFactory({
    [`git -C /repo cat-file -e ${expected}^{commit}`]: { status: 0, stdout: "", stderr: "" },
    [`git -C /repo merge-base --is-ancestor ${expected} origin/main`]: { status: 0, stdout: "", stderr: "" },
  });
  assertEvidenceRevisionReachableFromMain({
    repositoryRoot: "/repo",
    evidenceRevision: expected,
    run: reachableRun,
  });

  let unreachableGuard = false;
  try {
    assertEvidenceRevisionReachableFromMain({
      repositoryRoot: "/repo",
      evidenceRevision: expected,
      run: fakeRunFactory({
        [`git -C /repo cat-file -e ${expected}^{commit}`]: { status: 0, stdout: "", stderr: "" },
        [`git -C /repo merge-base --is-ancestor ${expected} origin/main`]: { status: 1, stdout: "", stderr: "" },
      }),
    });
  } catch {
    unreachableGuard = true;
  }
  if (!unreachableGuard) fail("self-test: unreachable evidence revision was not rejected");

  return {
    result: "PASS",
    generationId: "PASS",
    reentryHistory: "PASS",
    wrongHeadGuard: "PASS",
    dirtyWorktreeGuard: "PASS",
    wrongNodeVersionGuard: "PASS",
    outputPathGuard: "PASS",
    immutableFilenameGuard: "PASS",
    forbiddenEnvironmentGuards: "PASS",
    awsPrincipalSanitization: "PASS",
    iamAccessDeniedNegativeControls: "PASS",
    releaseFreezeClassification: "PASS",
    evidenceGitBlobIdentity: "PASS",
    evidenceRevisionReachability: "PASS",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--self-test")) {
    process.stdout.write(`${JSON.stringify(runCommonSelfTest(), null, 2)}\n`);
  } else {
    process.stderr.write("common.mjs is a support module; use --self-test for deterministic checks.\n");
    process.exitCode = 2;
  }
}
