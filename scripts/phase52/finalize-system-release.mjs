#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  defaultRun,
  makeInitialEvidenceRecord,
  makeReentryEvidenceRecord,
  readJson,
  readPhase52Schema,
  requireSuccess,
  validateEvidenceAgainstSchema,
} from "./common.mjs";

const RECORD_TYPE = "v0.4.0-system-release";
const OUTPUT_PATH = "docs/verification/v0.4.0-system-release.json";
const GENERATOR_PATH = "scripts/phase52/generate-system-release-evidence.mjs";
const MANIFEST_PATH = "docs/verification/v0.4.0-release-compatibility-manifest.json";
const PHASE51_FINAL_PATH = "docs/verification/phase51-final-verification.json";
const COMPATIBILITY_PATH = "docs/verification/phase51-cross-component-compatibility.json";
const REAL_S3_GATE_PATH = "docs/verification/phase52-real-s3-system-release-gate.json";
const ENVIRONMENT_GATE_PATH = "docs/verification/phase52-environment-conformance-system-release-gate.json";
const PHASE52_PARENT_ISSUE_ID = 5441;
const PHASE52_REQUIRED_COMPLETED_ISSUES = Object.freeze([5442, 5443, 5444, 5445]);
const PHASE52_FINAL_ISSUE_ID = 5446;
const SYSTEM_TAG = "system-v0.4.0";
const REDMINE_COMPONENT_TAG = "v0.3.0";
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function fail(message) {
  throw new Error(message);
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail(`${label} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    runnerRcRoot: null,
    redmineMain: "origin/main",
    runnerMain: "origin/main",
    output: null,
    verifiedAt: new Date().toISOString(),
    replaceExisting: false,
    invalidationReason: null,
    invalidatingDefectIssueId: null,
    invalidatedAt: null,
    finalize: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--runner-rc-root") options.runnerRcRoot = resolve(argv[++index]);
    else if (arg === "--redmine-main") options.redmineMain = argv[++index];
    else if (arg === "--runner-main") options.runnerMain = argv[++index];
    else if (arg === "--output") options.output = resolve(argv[++index]);
    else if (arg === "--verified-at") options.verifiedAt = argv[++index];
    else if (arg === "--replace-existing") options.replaceExisting = true;
    else if (arg === "--invalidation-reason") options.invalidationReason = argv[++index];
    else if (arg === "--invalidating-defect-issue-id") options.invalidatingDefectIssueId = parsePositiveInteger(argv[++index], arg);
    else if (arg === "--invalidated-at") options.invalidatedAt = argv[++index];
    else if (arg === "--finalize") options.finalize = true;
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }

  options.output ??= resolve(options.root, OUTPUT_PATH);
  if (!RFC3339.test(options.verifiedAt)) fail("--verified-at must be RFC3339");
  if (options.invalidatedAt !== null && !RFC3339.test(options.invalidatedAt)) {
    fail("--invalidated-at must be RFC3339");
  }
  if (!options.selfTest) {
    if (!options.finalize) fail("Phase 52-4 finalizer requires explicit --finalize");
    if (options.runnerRoot === null) fail("--runner-root is required");
    if (options.runnerRcRoot === null) fail("--runner-rc-root is required");
  }
  return options;
}

function sanitizeFailureMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    process.env.PHASE52_REDMINE_API_KEY,
    process.env.PHASE51_REDMINE_API_KEY,
    process.env.REDMINE_API_KEY,
  ]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message.replace(/\s+/gu, " ").trim().slice(0, 2048);
}

function git(root, args, label, run = defaultRun) {
  return requireSuccess(run("git", ["-C", root, ...args], { cwd: root }), label).trim();
}

function assertCurrentMainCheckout({ root, runnerRoot, redmineMain, runnerMain, run = defaultRun }) {
  const redmineStatus = git(root, ["status", "--porcelain"], "git status Redmine", run);
  if (redmineStatus !== "") fail("Redmine checkout must be clean before Final System Release Gate");
  const runnerStatus = git(runnerRoot, ["status", "--porcelain"], "git status Agent Runner", run);
  if (runnerStatus !== "") fail("Agent Runner main checkout must be clean before Final System Release Gate");

  const redmineHead = git(root, ["rev-parse", "HEAD"], "git rev-parse Redmine HEAD", run);
  const redmineExpected = git(root, ["rev-parse", redmineMain], `git rev-parse ${redmineMain}`, run);
  if (redmineHead !== redmineExpected) fail(`Redmine HEAD must equal ${redmineMain}`);

  const runnerHead = git(runnerRoot, ["rev-parse", "HEAD"], "git rev-parse Agent Runner HEAD", run);
  const runnerExpected = git(runnerRoot, ["rev-parse", runnerMain], `git rev-parse ${runnerMain}`, run);
  if (runnerHead !== runnerExpected) fail(`Agent Runner HEAD must equal ${runnerMain}`);

  return { redmineHead, runnerHead };
}

function redmineConnection() {
  const baseUrl = process.env.PHASE52_REDMINE_URL
    ?? process.env.PHASE51_REDMINE_URL
    ?? process.env.REDMINE_URL
    ?? null;
  const apiKey = process.env.PHASE52_REDMINE_API_KEY
    ?? process.env.PHASE51_REDMINE_API_KEY
    ?? process.env.REDMINE_API_KEY
    ?? null;
  if (!baseUrl) fail("PHASE52_REDMINE_URL, PHASE51_REDMINE_URL, or REDMINE_URL is required");
  if (!apiKey) fail("PHASE52_REDMINE_API_KEY, PHASE51_REDMINE_API_KEY, or REDMINE_API_KEY is required");
  return { baseUrl, apiKey };
}

async function redmineJson(baseUrl, apiKey, path) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//u, ""), normalized);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Redmine-API-Key": apiKey,
    },
  });
  if (!response.ok) fail(`Redmine GET ${url.pathname} failed with HTTP ${response.status}`);
  return response.json();
}

async function getIssue(baseUrl, apiKey, issueId, include = null) {
  const query = include ? `?include=${encodeURIComponent(include)}` : "";
  const body = await redmineJson(baseUrl, apiKey, `issues/${issueId}.json${query}`);
  if (!body?.issue) fail(`Redmine issue #${issueId} is missing`);
  return body.issue;
}

async function capturePhase52EntryState() {
  const { baseUrl, apiKey } = redmineConnection();
  const statuses = await redmineJson(baseUrl, apiKey, "issue_statuses.json");
  const closedStatusIds = new Set(
    (statuses.issue_statuses ?? []).filter((status) => status.is_closed).map((status) => status.id),
  );
  const required = [];
  for (const issueId of PHASE52_REQUIRED_COMPLETED_ISSUES) {
    const issue = await getIssue(baseUrl, apiKey, issueId);
    if (!closedStatusIds.has(issue.status?.id) || issue.done_ratio !== 100) {
      fail(`Phase 52 prerequisite #${issueId} must be closed with done_ratio=100`);
    }
    required.push({ issueId, status: issue.status.name, doneRatio: issue.done_ratio });
  }

  const parent = await getIssue(baseUrl, apiKey, PHASE52_PARENT_ISSUE_ID, "children");
  const known = new Set([...PHASE52_REQUIRED_COMPLETED_ISSUES, PHASE52_FINAL_ISSUE_ID]);
  const unexpectedChildren = (parent.children ?? []).filter((child) => !known.has(child.id));
  const openBlockingDefects = [];
  for (const child of unexpectedChildren) {
    const issue = await getIssue(baseUrl, apiKey, child.id);
    if (!closedStatusIds.has(issue.status?.id)) {
      openBlockingDefects.push({ issueId: issue.id, subject: issue.subject, status: issue.status?.name ?? "unknown" });
    }
  }
  if (openBlockingDefects.length > 0) {
    fail(`open Phase 52 blocking defect exists: ${openBlockingDefects.map((item) => `#${item.issueId}`).join(", ")}`);
  }

  return {
    parentIssueId: PHASE52_PARENT_ISSUE_ID,
    requiredCompletedIssues: required,
    openPhase52BlockingDefectCount: 0,
  };
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} is missing required text: ${needle}`);
}

function assertPrePublicationText({ roadmap040, roadmap100, redmineReadme, redmineChangelog, runnerReadme, runnerChangelog }) {
  if (/^- Agent Runner が専用 GCE deployment で動作する\s*$/mu.test(roadmap040)) {
    fail("040 roadmap still requires dedicated GCE deployment as v0.4.0 acceptance");
  }
  assertContains(roadmap040, "separate GCE VM", "040 roadmap architecture boundary");
  assertContains(roadmap040, "ownership / non-exposure separation", "040 roadmap credential scope");
  assertContains(roadmap040, "Environment Conformance Gate", "040 roadmap deferred environment verification");

  assertContains(roadmap100, "現在地点は Phase 52-3", "100 roadmap current state");
  assertContains(roadmap100, "起動コードと専用 GCE への配置", "100 roadmap deployment candidate");
  assertContains(roadmap100, "配置先での Redmine/MCP / Runner credential identity separation の確認", "100 roadmap credential candidate");
  if (/\|\s*v0\.4\.0\s*\|\s*\*\*Released\*\*/u.test(roadmap100)) {
    fail("100 roadmap must not declare v0.4.0 Released before Final Gate PASS");
  }

  for (const [label, text] of [
    ["Redmine README", redmineReadme],
    ["Redmine CHANGELOG", redmineChangelog],
    ["Agent Runner README", runnerReadme],
    ["Agent Runner CHANGELOG", runnerChangelog],
  ]) {
    assertContains(text, "Phase 52-3", label);
  }
  assertContains(runnerReadme, "resident-service startup", "Agent Runner README deployment boundary");
  assertContains(runnerChangelog, "resident production-service", "Agent Runner CHANGELOG deployment boundary");
  return "PASS";
}

async function verifyDocumentationPrePublication({ root, runnerRoot }) {
  const { baseUrl, apiKey } = redmineConnection();
  const [wiki040, wiki100] = await Promise.all([
    redmineJson(baseUrl, apiKey, "projects/414/wiki/040_%E3%83%AD%E3%83%BC%E3%83%89%E3%83%9E%E3%83%83%E3%83%97.json"),
    redmineJson(baseUrl, apiKey, "projects/414/wiki/100_%E3%83%AD%E3%83%BC%E3%83%89%E3%83%9E%E3%83%83%E3%83%97.json"),
  ]);
  const roadmap040 = wiki040?.wiki_page?.text ?? "";
  const roadmap100 = wiki100?.wiki_page?.text ?? "";
  return assertPrePublicationText({
    roadmap040,
    roadmap100,
    redmineReadme: readText(resolve(root, "README.md")),
    redmineChangelog: readText(resolve(root, "CHANGELOG.md")),
    runnerReadme: readText(resolve(runnerRoot, "README.md")),
    runnerChangelog: readText(resolve(runnerRoot, "CHANGELOG.md")),
  });
}

function runPhase52CandidateGenerator(options, run = defaultRun) {
  const script = resolve(options.root, GENERATOR_PATH);
  const args = [
    script,
    "--root", options.root,
    "--runner-root", options.runnerRoot,
    "--runner-rc-root", options.runnerRcRoot,
    "--redmine-main", options.redmineMain,
    "--runner-main", options.runnerMain,
    "--dry-run",
  ];
  const stdout = requireSuccess(
    run(process.execPath, args, { cwd: options.root, env: process.env }),
    "Phase 52-3 system release candidate dry-run",
  );
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail(`Phase 52-3 generator output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed.validation !== "PASS" || parsed.canonicalRecordWritten !== false) {
    fail("Phase 52-3 generator did not return a non-publishing PASS candidate");
  }
  if (parsed.candidateRecord?.recordType !== RECORD_TYPE || parsed.candidateRecord?.current?.result !== "PASS") {
    fail("Phase 52-3 generator candidate is not a PASS v0.4.0 system release record");
  }
  return parsed;
}

function verifyCompatibilityClosure(root) {
  const compatibility = readJson(resolve(root, COMPATIBILITY_PATH));
  if (compatibility?.current?.result !== "PASS") fail("cross-component compatibility is not PASS");
  const blockingIncompatibilityCount = compatibility.current.blockingIncompatibilityCount ?? 0;
  const unresolvedContractDriftCount = compatibility.current.unresolvedContractDriftCount ?? 0;
  const detectedDriftCount = Array.isArray(compatibility.current.detectedDrift) ? compatibility.current.detectedDrift.length : 0;
  if (blockingIncompatibilityCount !== 0) fail("blocking incompatibility is nonzero");
  if (unresolvedContractDriftCount !== 0 || detectedDriftCount !== 0) fail("stale or drifting compatibility evidence exists");
  return {
    blockingIncompatibilityCount: 0,
    staleReleaseEvidenceCount: 0,
  };
}

function buildFailureBase(root, verifiedAt) {
  const manifest = readJson(resolve(root, MANIFEST_PATH));
  const finalVerification = readJson(resolve(root, PHASE51_FINAL_PATH));
  const realS3 = readJson(resolve(root, REAL_S3_GATE_PATH));
  const environment = readJson(resolve(root, ENVIRONMENT_GATE_PATH));
  const currentManifest = manifest.current ?? {};
  return {
    systemMilestone: "v0.4.0",
    compatibleComponents: {
      redmineMcp: {
        componentVersion: currentManifest.redmineMcp?.componentVersion ?? null,
        exactSourceRevision: currentManifest.redmineMcp?.exactSourceRevision ?? null,
      },
      agentRunner: {
        componentVersion: currentManifest.agentRunner?.componentVersion ?? null,
        exactSourceRevision: currentManifest.agentRunner?.exactSourceRevision ?? null,
      },
    },
    contractIdentities: currentManifest.contracts ?? [],
    expectedHandoffProfile: currentManifest.expectedHandoffProfile ?? null,
    phase51FinalVerification: {
      path: PHASE51_FINAL_PATH,
      generation: finalVerification.generation ?? null,
      generationId: finalVerification.generationId ?? null,
      result: finalVerification.current?.result ?? "FAIL",
    },
    releaseCompatibilityManifest: {
      path: MANIFEST_PATH,
      generation: manifest.generation ?? null,
      generationId: manifest.generationId ?? null,
      result: currentManifest.result ?? "FAIL",
    },
    phase51GatePolicyReferences: (currentManifest.remainingReleaseOnlyChecks ?? []).map((entry) => ({
      checkId: entry.checkId,
      interpretation: "policyReference",
      repository: "mcp-mamono210/ai-agent-runner",
      path: entry.evidenceLocation,
    })),
    realPrivateS3Gate: realS3.current ?? null,
    environmentConformanceGate: environment.current ?? null,
    executionEnvironment: {
      realPrivateS3Gate: realS3.current?.executionHost ?? null,
      environmentConformanceGate: environment.current?.executionHost ?? null,
    },
    releaseFreezeVerification: {
      result: "FAIL",
      reason: "final pre-publication candidate generation did not complete",
    },
    knownLimitations: currentManifest.knownLimitations ?? [],
    outOfScopeBoundary: currentManifest.outOfScopeBoundary ?? [],
    systemTagPolicy: {
      tag: SYSTEM_TAG,
      repository: "mcp-mamono210/redmine",
      creationPhase: "52-4",
      targetRule: "must point to the exact commit containing the canonical PASS v0.4.0-system-release record",
      redmineMcpComponentTag: `${REDMINE_COMPONENT_TAG} unchanged`,
      agentRunnerSystemMilestoneTag: "must not be created",
    },
    result: "FAIL",
    verifiedAt,
  };
}

function assertSingleResultField(current) {
  if (!Object.hasOwn(current, "result")) fail("system release current.result is required");
  if (Object.hasOwn(current, "releaseResult")) fail("system release record must not contain releaseResult");
}

function persistCanonicalRecord(options, current, schema) {
  assertSingleResultField(current);
  let record;
  if (existsSync(options.output)) {
    if (!options.replaceExisting) {
      fail(`${OUTPUT_PATH} already exists; use --replace-existing with an invalidation reason for a new generation`);
    }
    const existing = readJson(options.output);
    validateEvidenceAgainstSchema(existing, schema);
    record = makeReentryEvidenceRecord(existing, current, {
      invalidationReason: options.invalidationReason,
      invalidatingDefectIssueId: options.invalidatingDefectIssueId,
      ...(options.invalidatedAt === null ? {} : { invalidatedAt: options.invalidatedAt }),
    });
    writeFileSync(options.output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } else {
    mkdirSync(dirname(options.output), { recursive: true });
    record = makeInitialEvidenceRecord(RECORD_TYPE, current);
    writeFileSync(options.output, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  }
  validateEvidenceAgainstSchema(record, schema);
  return record;
}

export async function finalizeSystemRelease(options, adapters = {}) {
  const run = adapters.run ?? defaultRun;
  const schema = adapters.schema ?? readPhase52Schema(options.root);
  let candidateCurrent = null;
  let stage = "checkout-closure";

  try {
    const checkout = assertCurrentMainCheckout({ ...options, run });
    stage = "phase52-3-candidate-revalidation";
    const candidate = runPhase52CandidateGenerator(options, run);
    candidateCurrent = structuredClone(candidate.candidateRecord.current);

    stage = "phase52-entry-state";
    const phase52EntryState = adapters.phase52EntryState ?? await capturePhase52EntryState();
    if (phase52EntryState.openPhase52BlockingDefectCount !== 0) fail("open Phase 52 blocking defect count is nonzero");

    stage = "cross-component-compatibility";
    const compatibility = verifyCompatibilityClosure(options.root);

    stage = "documentation-prepublication-alignment";
    const documentationPrePublicationAlignment = adapters.documentationPrePublicationAlignment
      ?? await verifyDocumentationPrePublication(options);

    const current = {
      ...candidateCurrent,
      documentationPreparation: {
        ...(candidateCurrent.documentationPreparation ?? {}),
        publicationState: "FINAL_GATE_PASS_AWAITING_TAG_AND_DOCUMENTATION_PUBLICATION",
      },
      finalSystemReleaseGate: {
        result: "PASS",
        finalPrePublicationVerification: "PASS",
        phase52EntryState,
        blockingIncompatibilityCount: compatibility.blockingIncompatibilityCount,
        staleReleaseEvidenceCount: compatibility.staleReleaseEvidenceCount,
        documentationPrePublicationAlignment,
        redmineMainRevision: checkout.redmineHead,
        agentRunnerMainRevision: checkout.runnerHead,
      },
      result: "PASS",
      verifiedAt: options.verifiedAt,
    };
    const record = persistCanonicalRecord(options, current, schema);
    return { record, current, publicationAllowed: true };
  } catch (error) {
    const message = sanitizeFailureMessage(error);
    const base = candidateCurrent === null
      ? buildFailureBase(options.root, options.verifiedAt)
      : structuredClone(candidateCurrent);
    const current = {
      ...base,
      documentationPreparation: {
        ...(base.documentationPreparation ?? {}),
        publicationState: "BLOCKED_BY_FINAL_GATE_FAIL",
      },
      finalSystemReleaseGate: {
        result: "FAIL",
        finalPrePublicationVerification: "FAIL",
        failure: { stage, message },
      },
      result: "FAIL",
      verifiedAt: options.verifiedAt,
    };
    const record = persistCanonicalRecord(options, current, schema);
    return { record, current, publicationAllowed: false };
  }
}

function runSelfTest(root) {
  const schema = readPhase52Schema(root);
  const currentFail = {
    systemMilestone: "v0.4.0",
    compatibleComponents: {},
    contractIdentities: [],
    expectedHandoffProfile: {},
    phase51FinalVerification: {},
    releaseCompatibilityManifest: {},
    phase51GatePolicyReferences: [],
    realPrivateS3Gate: {},
    environmentConformanceGate: {},
    executionEnvironment: {},
    releaseFreezeVerification: { result: "FAIL" },
    knownLimitations: [],
    outOfScopeBoundary: [],
    systemTagPolicy: { tag: SYSTEM_TAG },
    finalSystemReleaseGate: { result: "FAIL" },
    result: "FAIL",
    verifiedAt: "2026-09-25T00:00:00Z",
  };
  assertSingleResultField(currentFail);
  const first = makeInitialEvidenceRecord(RECORD_TYPE, currentFail);
  validateEvidenceAgainstSchema(first, schema);

  const currentPass = structuredClone(currentFail);
  currentPass.releaseFreezeVerification = { result: "PASS" };
  currentPass.finalSystemReleaseGate = { result: "PASS", finalPrePublicationVerification: "PASS" };
  currentPass.result = "PASS";
  currentPass.verifiedAt = "2026-09-25T01:00:00Z";
  const second = makeReentryEvidenceRecord(first, currentPass, {
    invalidationReason: "blocking defect corrected",
    invalidatingDefectIssueId: 9999,
    invalidatedAt: "2026-09-25T00:30:00Z",
  });
  validateEvidenceAgainstSchema(second, schema);
  if (second.generation !== 2 || second.history[0]?.snapshot?.result !== "FAIL") fail("self-test FAIL -> PASS lineage failed");

  assertPrePublicationText({
    roadmap040: "separate GCE VM\nownership / non-exposure separation\nEnvironment Conformance Gate",
    roadmap100: "現在地点は Phase 52-3\n起動コードと専用 GCE への配置\n配置先での Redmine/MCP / Runner credential identity separation の確認",
    redmineReadme: "Phase 52-3",
    redmineChangelog: "Phase 52-3",
    runnerReadme: "Phase 52-3 resident-service startup",
    runnerChangelog: "Phase 52-3 resident production-service",
  });

  let releasedGuard = false;
  try {
    assertPrePublicationText({
      roadmap040: "separate GCE VM\nownership / non-exposure separation\nEnvironment Conformance Gate",
      roadmap100: "現在地点は Phase 52-3\n起動コードと専用 GCE への配置\n配置先での Redmine/MCP / Runner credential identity separation の確認\n| v0.4.0 | **Released** |",
      redmineReadme: "Phase 52-3",
      redmineChangelog: "Phase 52-3",
      runnerReadme: "Phase 52-3 resident-service startup",
      runnerChangelog: "Phase 52-3 resident production-service",
    });
  } catch {
    releasedGuard = true;
  }
  if (!releasedGuard) fail("self-test premature Released publication was accepted");

  return {
    result: "PASS",
    failGenerationPreserved: "PASS",
    passSupersedesFail: "PASS",
    singleResultField: "PASS",
    prePublicationDocumentationGuard: "PASS",
    prematureReleasedGuard: "PASS",
    explicitFinalizeBoundary: "PASS",
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(options.root), null, 2)}\n`);
  } else {
    const finalized = await finalizeSystemRelease(options);
    process.stdout.write(`${JSON.stringify({
      result: finalized.current.result,
      generation: finalized.record.generation,
      generationId: finalized.record.generationId,
      output: options.output,
      publicationAllowed: finalized.publicationAllowed,
      systemTag: finalized.publicationAllowed ? SYSTEM_TAG : null,
    }, null, 2)}\n`);
    if (!finalized.publicationAllowed) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
