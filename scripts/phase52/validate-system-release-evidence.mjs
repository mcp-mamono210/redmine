#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  makeInitialEvidenceRecord,
  makeReentryEvidenceRecord,
  readJson,
  runCommonSelfTest,
  validateEvidenceAgainstSchema,
} from "./common.mjs";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    schema: null,
    records: [],
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--schema") options.schema = resolve(argv[++index]);
    else if (arg === "--record") options.records.push(resolve(argv[++index]));
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  options.schema ??= resolve(
    options.root,
    "docs/verification/phase52-system-release-evidence.schema.json",
  );
  return options;
}

function assertSchemaContract(schema) {
  const expected = [
    "phase52-real-s3-system-release-gate",
    "phase52-environment-conformance-system-release-gate",
    "v0.4.0-system-release",
  ];
  const actual = schema?.properties?.recordType?.enum;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("Phase 52 evidence schema recordType enum drift");
  }
  if (schema?.properties?.current?.type !== "object") {
    fail("Phase 52 evidence schema must leave domain-specific current fields to Phase 52-1..52-4");
  }
  const comment = String(schema?.$comment ?? "");
  if (!comment.includes("release-evidence-only")) {
    fail("Phase 52 evidence schema must identify itself as release-evidence-only");
  }
  if (!comment.includes("non-cross-component-contract")) {
    fail("Phase 52 evidence schema must remain outside cross-component contract identity closure");
  }
}

function validateRecordPath(path, schema) {
  const record = readJson(path);
  validateEvidenceAgainstSchema(record, schema);
  return {
    path,
    recordType: record.recordType,
    generation: record.generation,
    generationId: record.generationId,
  };
}

function runSelfTest(schema) {
  const common = runCommonSelfTest();
  if (common.result !== "PASS") fail("Phase 52 common self-test failed");

  const first = makeInitialEvidenceRecord(
    "phase52-environment-conformance-system-release-gate",
    {
      testedSourceRevision: "a".repeat(40),
      result: "FAIL",
    },
  );
  validateEvidenceAgainstSchema(first, schema);

  const second = makeReentryEvidenceRecord(
    first,
    {
      testedSourceRevision: "a".repeat(40),
      result: "PASS",
    },
    {
      invalidationReason: "environment corrected",
      invalidatedAt: "2026-09-25T00:00:00Z",
      invalidatingDefectIssueId: null,
    },
  );
  validateEvidenceAgainstSchema(second, schema);

  let brokenHistoryGuard = false;
  try {
    const broken = structuredClone(second);
    broken.history[0].snapshot.result = "PASS";
    validateEvidenceAgainstSchema(broken, schema);
  } catch {
    brokenHistoryGuard = true;
  }
  if (!brokenHistoryGuard) fail("self-test: broken history snapshot was not rejected");

  let unknownRecordTypeGuard = false;
  try {
    validateEvidenceAgainstSchema(
      { ...first, recordType: "phase52-unknown" },
      schema,
    );
  } catch {
    unknownRecordTypeGuard = true;
  }
  if (!unknownRecordTypeGuard) fail("self-test: unknown recordType was not rejected");

  return {
    result: "PASS",
    commonSupport: "PASS",
    schemaContract: "PASS",
    generationId: "PASS",
    reentryHistory: "PASS",
    brokenHistoryGuard: "PASS",
    unknownRecordTypeGuard: "PASS",
  };
}

function main(options) {
  const schema = JSON.parse(readFileSync(options.schema, "utf8"));
  assertSchemaContract(schema);

  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(schema), null, 2)}\n`);
    return;
  }

  if (options.records.length === 0) {
    fail("At least one --record is required unless --self-test is used");
  }

  const validated = options.records.map((path) => validateRecordPath(path, schema));
  process.stdout.write(`${JSON.stringify({ result: "PASS", validated }, null, 2)}\n`);
}

const options = parseArgs(process.argv.slice(2));
try {
  main(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
