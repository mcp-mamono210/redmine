#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!ref.startsWith("#/$defs/")) {
    fail(`Unsupported $ref: ${ref}`);
  }
  const key = ref.slice("#/$defs/".length);
  const target = rootSchema.$defs?.[key];
  if (!target) fail(`Unknown $ref: ${ref}`);
  return target;
}

export function validateSchema(value, schema, rootSchema = schema, path = "$") {
  if (schema.$ref) {
    return validateSchema(value, resolveRef(rootSchema, schema.$ref), rootSchema, path);
  }

  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    fail(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
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
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
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
      value.forEach((item, index) => validateSchema(item, schema.items, rootSchema, `${path}[${index}]`));
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
        validateSchema(value[key], childSchema, rootSchema, `${path}.${key}`);
      }
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return createHash("sha1").update(header).update(buffer).digest("hex");
}

function constraintAccepts(constraintId, value) {
  switch (constraintId) {
    case "redmine-principal-v1":
      return /^redmine-user:[1-9]\d*$/.test(value);
    case "rfc3339-offset-timestamp-v1":
      return RFC3339.test(value);
    case "positive-safe-base10-integer-v1": {
      if (!/^[1-9]\d*$/.test(value)) return false;
      try {
        return BigInt(value) <= MAX_SAFE_BIGINT;
      } catch {
        return false;
      }
    }
    case "nonblank-opaque-string-v1":
      return typeof value === "string" && value.trim().length > 0;
    case "sha256-lowercase-hex-v1":
      return SHA256_ID.test(value);
    default:
      fail(`Unknown constraintId: ${constraintId}`);
  }
}

function validateConstraintVectors(profile) {
  const expectedApproval = {
    approvedBy: ["Brief Approved By", "redmine-principal-v1"],
    approvedAt: ["Brief Approved At", "rfc3339-offset-timestamp-v1"],
    approvedBriefRevision: ["Approved Brief Revision", "positive-safe-base10-integer-v1"],
    approvedPersistedRevision: ["Approved Persisted Revision", "nonblank-opaque-string-v1"],
    approvedRequirementsFingerprint: ["Approved Req Fingerprint", "sha256-lowercase-hex-v1"],
  };
  for (const [key, [fieldName, constraintId]] of Object.entries(expectedApproval)) {
    const field = profile.approval[key];
    if (field?.fieldName !== fieldName) fail(`canonical field-name drift for ${key}`);
    if (field?.constraint?.constraintId !== constraintId) fail(`canonical constraint drift for ${key}`);
  }
  const expectedHandoffFields = [
    "repository",
    "redmine_issue_id",
    "brief_revision",
    "persisted_revision",
    "requirements_fingerprint",
    "approver_identity",
    "approved_at",
  ];
  if (JSON.stringify(profile.handoffIdentity.requiredFields) !== JSON.stringify(expectedHandoffFields)) {
    fail("canonical handoff requiredFields drift");
  }

  for (const [constraintId, vectors] of Object.entries(profile.constraints)) {
    for (const value of vectors.positive) {
      if (!constraintAccepts(constraintId, value)) {
        fail(`positive vector rejected for ${constraintId}: ${JSON.stringify(value)}`);
      }
    }
    for (const value of vectors.negative) {
      if (constraintAccepts(constraintId, value)) {
        fail(`negative vector accepted for ${constraintId}: ${JSON.stringify(value)}`);
      }
    }
  }

  const fields = Object.values(profile.approval);
  const names = fields.map((field) => field.fieldName);
  if (new Set(names).size !== names.length) fail("approval field names must be unique");
  for (const field of fields) {
    if (!Object.hasOwn(profile.constraints, field.constraint.constraintId)) {
      fail(`undeclared constraintId: ${field.constraint.constraintId}`);
    }
  }
}

function validateRegistrySemantics(registry, profile, mode) {
  const ids = registry.contracts.map((entry) => entry.contractId);
  if (new Set(ids).size !== ids.length) fail("contractId values must be unique");

  const byId = new Map(registry.contracts.map((entry) => [entry.contractId, entry]));
  for (const reference of profile.contractReferences) {
    const entry = byId.get(reference.contractId);
    if (!entry) fail(`profile references unregistered contract ${reference.contractId}`);
    if (entry.semanticRevision !== reference.semanticRevision) {
      fail(`profile semantic revision mismatch for ${reference.contractId}`);
    }
  }

  const pending = registry.contracts.filter((entry) => entry.registrationState === "pending-first-commit");
  for (const entry of registry.contracts) {
    if (!SHA1.test(entry.sourceBlobSha)) fail(`invalid sourceBlobSha for ${entry.contractId}`);
    if (entry.registrationState === "committed" && !SHA1.test(entry.sourceRevision ?? "")) {
      fail(`committed contract must have exact sourceRevision: ${entry.contractId}`);
    }
    if (entry.registrationState === "pending-first-commit" && entry.sourceRevision !== null) {
      fail(`pending contract sourceRevision must be null: ${entry.contractId}`);
    }
  }

  if (pending.length > 1 || (pending.length === 1 && pending[0].contractId !== "system-release-compatibility")) {
    fail("only system-release-compatibility may use pending-first-commit");
  }
  if (mode === "strict" && pending.length !== 0) {
    fail("strict validation rejects pending-first-commit registry entries");
  }
}

function validateNewContractBlob(root, registry) {
  const entry = registry.contracts.find((candidate) => candidate.contractId === "system-release-compatibility");
  if (!entry) fail("system-release-compatibility registry entry is required");
  const path = resolve(root, entry.path);
  const actual = gitBlobSha(readFileSync(path));
  if (actual !== entry.sourceBlobSha) {
    fail(`system release contract blob mismatch: expected ${entry.sourceBlobSha}, got ${actual}`);
  }
}

function gitShowBlob(root, revision, path) {
  return execFileSync("git", ["-C", root, "show", `${revision}:${path}`], { encoding: null, stdio: ["ignore", "pipe", "pipe"] });
}

function validateLocalCommittedBlobs(root, registry, mode) {
  if (mode !== "strict") return;
  for (const entry of registry.contracts) {
    if (entry.registrationState !== "committed") continue;
    if (entry.repository !== "mcp-mamono210/redmine") continue;
    let bytes;
    try {
      bytes = gitShowBlob(root, entry.sourceRevision, entry.path);
    } catch (error) {
      fail(`cannot read committed contract ${entry.contractId} at ${entry.sourceRevision}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const actual = gitBlobSha(bytes);
    if (actual !== entry.sourceBlobSha) {
      fail(`committed blob mismatch for ${entry.contractId}: expected ${entry.sourceBlobSha}, got ${actual}`);
    }
  }
}

function sampleEvidence() {
  const current = { componentVersion: "0.3.0", exactSourceRevision: "a".repeat(40) };
  const canonical = JSON.stringify({ recordType: "redmine-mcp-rc-identity", generation: 1, current });
  return {
    schemaVersion: 1,
    recordType: "redmine-mcp-rc-identity",
    generation: 1,
    generationId: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    current,
    history: [],
    supersedes: null,
  };
}

function validateBlockingDefectHistory(record) {
  for (const entry of record.history) {
    if (entry.invalidationReason.startsWith("blocking-defect:") && !Number.isInteger(entry.invalidatingDefectIssueId)) {
      fail("blocking-defect history entry requires invalidatingDefectIssueId");
    }
  }
}

export function validateAll({ root, mode = "staging" }) {
  const paths = {
    evidenceSchema: resolve(root, "docs/contracts/system-release-compatibility-evidence.schema.json"),
    registrySchema: resolve(root, "docs/contracts/system-release-compatibility-contract-registry.schema.json"),
    profileSchema: resolve(root, "docs/contracts/system-release-handoff-profile.schema.json"),
    registry: resolve(root, "docs/contracts/system-release-compatibility-contract-registry.json"),
    profile: resolve(root, "docs/contracts/system-release-handoff-profile.json"),
  };

  const evidenceSchema = readJson(paths.evidenceSchema);
  const registrySchema = readJson(paths.registrySchema);
  const profileSchema = readJson(paths.profileSchema);
  const registry = readJson(paths.registry);
  const profile = readJson(paths.profile);

  validateSchema(registry, registrySchema);
  validateSchema(profile, profileSchema);
  const evidence = sampleEvidence();
  validateSchema(evidence, evidenceSchema);
  validateBlockingDefectHistory(evidence);
  validateConstraintVectors(profile);
  validateRegistrySemantics(registry, profile, mode);
  validateNewContractBlob(root, registry);
  validateLocalCommittedBlobs(root, registry, mode);

  return { registry, profile, evidence };
}

export function runNegativeControls({ root }) {
  const evidenceSchema = readJson(resolve(root, "docs/contracts/system-release-compatibility-evidence.schema.json"));
  const registrySchema = readJson(resolve(root, "docs/contracts/system-release-compatibility-contract-registry.schema.json"));
  const profileSchema = readJson(resolve(root, "docs/contracts/system-release-handoff-profile.schema.json"));
  const registry = readJson(resolve(root, "docs/contracts/system-release-compatibility-contract-registry.json"));
  const profile = readJson(resolve(root, "docs/contracts/system-release-handoff-profile.json"));

  const cases = [
    () => { const x = sampleEvidence(); delete x.generationId; validateSchema(x, evidenceSchema); },
    () => { const x = sampleEvidence(); x.supersedes = "not-a-generation-id"; validateSchema(x, evidenceSchema); },
    () => {
      const x = sampleEvidence();
      x.history = [{ generation: 1, generationId: x.generationId, snapshot: {}, invalidatedAt: "2026-09-22T00:00:00Z", invalidatingDefectIssueId: 5434 }];
      validateSchema(x, evidenceSchema);
    },
    () => {
      const x = sampleEvidence();
      x.history = [{ generation: 1, generationId: x.generationId, snapshot: {}, invalidatedAt: "2026-09-22T00:00:00Z", invalidationReason: "blocking-defect: compatibility drift", invalidatingDefectIssueId: null }];
      validateSchema(x, evidenceSchema); validateBlockingDefectHistory(x);
    },
    () => { const x = structuredClone(registry); x.contracts.push(structuredClone(x.contracts[0])); validateSchema(x, registrySchema); validateRegistrySemantics(x, profile, "staging"); },
    () => { const x = structuredClone(registry); x.contracts[0].semanticRevision = 0; validateSchema(x, registrySchema); },
    () => { const x = structuredClone(registry); x.contracts[0].sourceBlobSha = "bad"; validateSchema(x, registrySchema); },
    () => { const x = structuredClone(profile); delete x.lifecycle.readyForAgentValue; validateSchema(x, profileSchema); },
    () => { const x = structuredClone(profile); x.approval.approvedBy.constraint.constraintId = "unknown-v1"; validateSchema(x, profileSchema); validateConstraintVectors(x); },
    () => { const x = structuredClone(profile); x.lifecycle.readyForAgentValue = null; validateSchema(x, profileSchema); },
    () => { const x = structuredClone(profile); x.approval.approvedAt.constraint.constraintId = "redmine-principal-v1"; validateSchema(x, profileSchema); validateConstraintVectors(x); },
    () => { const x = structuredClone(profile); x.approval.approvedBy.constraint.constraintId = "sha256-lowercase-hex-v1"; validateSchema(x, profileSchema); validateConstraintVectors(x); },
  ];

  for (const [index, testCase] of cases.entries()) {
    let failed = false;
    try {
      testCase();
    } catch {
      failed = true;
    }
    if (!failed) fail(`negative control ${index + 1} unexpectedly passed`);
  }
  return cases.length;
}

function parseArgs(argv) {
  const options = { root: process.cwd(), mode: "staging", negativeControls: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.root = resolve(argv[++i]);
    else if (arg === "--mode") options.mode = argv[++i];
    else if (arg === "--negative-controls") options.negativeControls = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!["staging", "strict"].includes(options.mode)) fail(`Unknown mode: ${options.mode}`);
  return options;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (invokedPath) {
  try {
    const options = parseArgs(process.argv.slice(2));
    validateAll(options);
    const negativeCount = options.negativeControls ? runNegativeControls(options) : 0;
    process.stdout.write(`Phase 51-1 compatibility contract validation PASS (${options.mode}); negativeControls=${negativeCount}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
