#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertNoReleaseFreezeViolations,
  defaultRun,
  gitChangedPaths,
  readJson,
  readPhase52Schema,
  requireSuccess,
  validateEvidenceAgainstSchema,
} from "./common.mjs";

const RECORD_PATH = "docs/verification/v0.4.0-system-release.json";
const RECORD_TYPE = "v0.4.0-system-release";
const SYSTEM_TAG = "system-v0.4.0";
const REDMINE_COMPONENT_TAG = "v0.3.0";
const REDMINE_COMPONENT_TAG_EXPECTED_COMMIT = "020f1fe20706b5943c234bcf85b47ebcea8ca96d";
const PROJECT_ID = 414;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    runnerRoot: null,
    redmineMain: "origin/main",
    runnerMain: "origin/main",
    systemTag: SYSTEM_TAG,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--runner-root") options.runnerRoot = resolve(argv[++index]);
    else if (arg === "--redmine-main") options.redmineMain = argv[++index];
    else if (arg === "--runner-main") options.runnerMain = argv[++index];
    else if (arg === "--system-tag") options.systemTag = argv[++index];
    else if (arg === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.selfTest && options.runnerRoot === null) fail("--runner-root is required");
  return options;
}

function git(root, args, label, run = defaultRun) {
  return requireSuccess(run("git", ["-C", root, ...args], { cwd: root }), label).trim();
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
    headers: { Accept: "application/json", "X-Redmine-API-Key": apiKey },
  });
  if (!response.ok) fail(`Redmine GET ${url.pathname} failed with HTTP ${response.status}`);
  return response.json();
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} is missing required text: ${needle}`);
}

function assertPublishedDocumentationText({ record, roadmap040, roadmap100, redmineReadme, redmineChangelog, runnerReadme, runnerChangelog }) {
  const generationId = record.generationId;
  const redmineRevision = record.current.compatibleComponents?.redmineMcp?.exactSourceRevision;
  const runnerRevision = record.current.compatibleComponents?.agentRunner?.exactSourceRevision;

  if (!/\|\s*v0\.4\.0\s*\|\s*\*\*Released\*\*/u.test(roadmap100)) {
    fail("100 roadmap does not declare v0.4.0 Released");
  }
  assertContains(roadmap100, "起動コードと専用 GCE への配置", "100 roadmap deployment candidate");
  assertContains(roadmap100, "credential identity separation", "100 roadmap credential candidate");

  assertContains(roadmap040, "v0.4.0 = Released", "040 roadmap release state");
  assertContains(roadmap040, "separate GCE VM", "040 roadmap architecture boundary");
  assertContains(roadmap040, "Environment Conformance Gate", "040 roadmap deferred environment verification");
  if (/^- Agent Runner が専用 GCE deployment で動作する\s*$/mu.test(roadmap040)) {
    fail("040 roadmap reintroduced dedicated GCE deployment as v0.4.0 acceptance");
  }

  for (const [label, text] of [
    ["Redmine README", redmineReadme],
    ["Redmine CHANGELOG", redmineChangelog],
    ["Agent Runner README", runnerReadme],
    ["Agent Runner CHANGELOG", runnerChangelog],
  ]) {
    assertContains(text, SYSTEM_TAG, label);
    assertContains(text, generationId, label);
    assertContains(text, "Ready for Independent Verification", label);
    if (redmineRevision) assertContains(text, redmineRevision, label);
    if (runnerRevision) assertContains(text, runnerRevision, label);
  }
  assertContains(runnerReadme, "resident", "Agent Runner README deployment boundary");
  assertContains(runnerChangelog, "resident", "Agent Runner CHANGELOG deployment boundary");
  return "PASS";
}

function assertGitPublicationClosure({ root, runnerRoot, redmineMain, systemTag, record }, run = defaultRun) {
  const head = git(root, ["rev-parse", "HEAD"], "git rev-parse Redmine HEAD", run);
  const main = git(root, ["rev-parse", redmineMain], `git rev-parse ${redmineMain}`, run);
  if (head !== main) fail(`Redmine HEAD must equal ${redmineMain} for post-publication verification`);
  const status = git(root, ["status", "--porcelain"], "git status Redmine", run);
  if (status !== "") fail("Redmine checkout must be clean for post-publication verification");

  const recordCommit = git(root, ["log", "-1", "--format=%H", redmineMain, "--", RECORD_PATH], "locate canonical record commit", run);
  if (recordCommit === "") fail("canonical system release record is not committed on Redmine main");
  const tagCommit = git(root, ["rev-parse", `${systemTag}^{commit}`], `resolve ${systemTag}`, run);
  if (tagCommit !== recordCommit) fail(`${systemTag} must point to the exact canonical record commit`);
  git(root, ["merge-base", "--is-ancestor", recordCommit, redmineMain], "canonical record commit main reachability", run);

  const taggedRecordText = git(root, ["show", `${tagCommit}:${RECORD_PATH}`], "read canonical record from system tag", run);
  const taggedRecord = JSON.parse(taggedRecordText);
  if (taggedRecord.generationId !== record.generationId || taggedRecord.current?.result !== "PASS") {
    fail(`${systemTag} does not contain the current PASS system release record`);
  }

  const componentTagCommit = git(root, ["rev-parse", `${REDMINE_COMPONENT_TAG}^{commit}`], `resolve ${REDMINE_COMPONENT_TAG}`, run);
  if (componentTagCommit !== REDMINE_COMPONENT_TAG_EXPECTED_COMMIT) {
    fail(`${REDMINE_COMPONENT_TAG} component tag changed from its pre-Phase-52 target`);
  }

  const localRunnerSystemTag = git(runnerRoot, ["tag", "-l", systemTag], "list Agent Runner local system tag", run);
  if (localRunnerSystemTag !== "") fail("Agent Runner must not contain a system milestone tag");
  const remoteRunnerSystemTag = requireSuccess(
    run("git", ["-C", runnerRoot, "ls-remote", "--tags", "origin", `refs/tags/${systemTag}`], { cwd: runnerRoot }),
    "check Agent Runner remote system tag",
  ).trim();
  if (remoteRunnerSystemTag !== "") fail("Agent Runner remote must not contain a system milestone tag");

  return { recordCommit, tagCommit, redmineMainRevision: main };
}


function verifyPostPublicationReleaseFreeze({ root, runnerRoot, redmineMain, runnerMain, record }, run = defaultRun) {
  const redmineChangedPaths = gitChangedPaths({
    repositoryRoot: root,
    baseRevision: record.current.compatibleComponents.redmineMcp.exactSourceRevision,
    head: redmineMain,
    run,
  });
  const runnerChangedPaths = gitChangedPaths({
    repositoryRoot: runnerRoot,
    baseRevision: record.current.compatibleComponents.agentRunner.exactSourceRevision,
    head: runnerMain,
    run,
  });
  const redmine = assertNoReleaseFreezeViolations(redmineChangedPaths);
  const agentRunner = assertNoReleaseFreezeViolations(runnerChangedPaths);
  return {
    result: "PASS",
    redmineMcpForbiddenChangeCount: redmine.frozen.length,
    agentRunnerForbiddenChangeCount: agentRunner.frozen.length,
  };
}

async function verifyPublishedDocumentation({ root, runnerRoot, record }) {
  const { baseUrl, apiKey } = redmineConnection();
  const [wiki040, wiki100] = await Promise.all([
    redmineJson(baseUrl, apiKey, `projects/${PROJECT_ID}/wiki/040_%E3%83%AD%E3%83%BC%E3%83%89%E3%83%9E%E3%83%83%E3%83%97.json`),
    redmineJson(baseUrl, apiKey, `projects/${PROJECT_ID}/wiki/100_%E3%83%AD%E3%83%BC%E3%83%89%E3%83%9E%E3%83%83%E3%83%97.json`),
  ]);
  return assertPublishedDocumentationText({
    record,
    roadmap040: wiki040?.wiki_page?.text ?? "",
    roadmap100: wiki100?.wiki_page?.text ?? "",
    redmineReadme: readFileSync(resolve(root, "README.md"), "utf8"),
    redmineChangelog: readFileSync(resolve(root, "CHANGELOG.md"), "utf8"),
    runnerReadme: readFileSync(resolve(runnerRoot, "README.md"), "utf8"),
    runnerChangelog: readFileSync(resolve(runnerRoot, "CHANGELOG.md"), "utf8"),
  });
}

export async function verifySystemReleasePublication(options, adapters = {}) {
  const schema = adapters.schema ?? readPhase52Schema(options.root);
  const record = readJson(resolve(options.root, RECORD_PATH));
  validateEvidenceAgainstSchema(record, schema);
  if (record.recordType !== RECORD_TYPE) fail(`canonical recordType must be ${RECORD_TYPE}`);
  if (record.current?.result !== "PASS") fail("canonical system release result must be PASS before publication verification");
  if (record.current?.systemTagPolicy?.tag !== options.systemTag) fail("canonical system tag policy does not match requested tag");

  const run = adapters.run ?? defaultRun;
  const gitClosure = assertGitPublicationClosure({ ...options, record }, run);
  const releaseFreezeVerification = verifyPostPublicationReleaseFreeze({ ...options, record }, run);
  const documentation = adapters.documentation ?? await verifyPublishedDocumentation({ ...options, record });

  return {
    result: "PASS",
    generation: record.generation,
    generationId: record.generationId,
    systemTag: options.systemTag,
    systemTagCommit: gitClosure.tagCommit,
    documentation,
    releaseFreezeVerification,
    compatibleComponents: record.current.compatibleComponents,
    functionalBoundary: "Ready for Independent Verification",
  };
}

function runSelfTest() {
  const record = {
    generationId: `sha256:${"a".repeat(64)}`,
    current: {
      compatibleComponents: {
        redmineMcp: { exactSourceRevision: "b".repeat(40) },
        agentRunner: { exactSourceRevision: "c".repeat(40) },
      },
    },
  };
  const commonDocs = `${SYSTEM_TAG}\n${record.generationId}\n${"b".repeat(40)}\n${"c".repeat(40)}\nReady for Independent Verification\nresident`;
  assertPublishedDocumentationText({
    record,
    roadmap040: "v0.4.0 = Released\nseparate GCE VM\nEnvironment Conformance Gate",
    roadmap100: "| v0.4.0 | **Released** |\n起動コードと専用 GCE への配置\ncredential identity separation",
    redmineReadme: commonDocs,
    redmineChangelog: commonDocs,
    runnerReadme: commonDocs,
    runnerChangelog: commonDocs,
  });

  let tagBoundaryGuard = false;
  try {
    assertPublishedDocumentationText({
      record,
      roadmap040: "v0.4.0 = Released\nseparate GCE VM\nEnvironment Conformance Gate\n- Agent Runner が専用 GCE deployment で動作する",
      roadmap100: "| v0.4.0 | **Released** |\n起動コードと専用 GCE への配置\ncredential identity separation",
      redmineReadme: commonDocs,
      redmineChangelog: commonDocs,
      runnerReadme: commonDocs,
      runnerChangelog: commonDocs,
    });
  } catch {
    tagBoundaryGuard = true;
  }
  if (!tagBoundaryGuard) fail("self-test dedicated GCE acceptance regression was not rejected");

  return {
    result: "PASS",
    releasedDocumentationContract: "PASS",
    generationIdTraceability: "PASS",
    componentIdentityTraceability: "PASS",
    dedicatedGceAcceptanceGuard: "PASS",
    componentTagBaseline: REDMINE_COMPONENT_TAG_EXPECTED_COMMIT,
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  } else {
    const result = await verifySystemReleasePublication(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
