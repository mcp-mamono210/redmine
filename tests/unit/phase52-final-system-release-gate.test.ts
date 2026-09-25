import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const FINALIZER = resolve(ROOT, "scripts/phase52/finalize-system-release.mjs");
const POST_PUBLICATION = resolve(ROOT, "scripts/phase52/verify-system-release-publication.mjs");

function runNode(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("Phase 52-4 Final System Release Gate / Publication", () => {
  it("keeps Final Gate scripts syntactically valid and deterministic self-tests PASS", () => {
    for (const script of [FINALIZER, POST_PUBLICATION]) {
      expect(() => execFileSync(process.execPath, ["--check", script], { cwd: ROOT, encoding: "utf8" })).not.toThrow();
      expect(runNode(script, "--self-test")).toContain('"result": "PASS"');
    }
  });

  it("requires an explicit finalization action and reuses the Phase 52-3 dry-run as the pre-publication gate", () => {
    const source = readFileSync(FINALIZER, "utf8");

    expect(source).toContain("requires explicit --finalize");
    expect(source).toContain("generate-system-release-evidence.mjs");
    expect(source).toContain('"--dry-run"');
    expect(source).toContain("canonicalRecordWritten !== false");
    expect(source).toContain("Phase 52-3 generator candidate is not a PASS");
  });

  it("persists FAIL generations and requires explicit re-entry lineage before later PASS", () => {
    const source = readFileSync(FINALIZER, "utf8");

    expect(source).toContain("makeInitialEvidenceRecord");
    expect(source).toContain("makeReentryEvidenceRecord");
    expect(source).toContain("--replace-existing");
    expect(source).toContain("invalidationReason");
    expect(source).toContain('result: "FAIL"');
    expect(source).toContain("publicationAllowed: false");
  });

  it("closes Phase 52 entry state, compatibility, documentation, and release-freeze inputs before PASS", () => {
    const source = readFileSync(FINALIZER, "utf8");

    expect(source).toContain("PHASE52_REQUIRED_COMPLETED_ISSUES");
    expect(source).toContain("openPhase52BlockingDefectCount");
    expect(source).toContain("blockingIncompatibilityCount");
    expect(source).toContain("staleReleaseEvidenceCount");
    expect(source).toContain("documentationPrePublicationAlignment");
    expect(source).toContain("Redmine checkout must be clean");
    expect(source).toContain("Agent Runner main checkout must be clean");
  });

  it("keeps one canonical result field and never duplicates releaseResult", () => {
    const source = readFileSync(FINALIZER, "utf8");

    expect(source).toContain("system release current.result is required");
    expect(source).toContain("system release record must not contain releaseResult");
  });

  it("verifies the system tag points to the exact canonical record commit and keeps component tag identity separate", () => {
    const source = readFileSync(POST_PUBLICATION, "utf8");

    expect(source).toContain("must point to the exact canonical record commit");
    expect(source).toContain('["log", "-1", "--format=%H", redmineMain, "--", RECORD_PATH]');
    expect(source).toContain('const REDMINE_COMPONENT_TAG = "v0.3.0"');
    expect(source).toContain("020f1fe20706b5943c234bcf85b47ebcea8ca96d");
    expect(source).toContain("Agent Runner must not contain a system milestone tag");
    expect(source).toContain("Agent Runner remote must not contain a system milestone tag");
  });

  it("requires Released documentation to expose generationId and exact component identities without changing deployment scope", () => {
    const source = readFileSync(POST_PUBLICATION, "utf8");

    expect(source).toContain("100 roadmap does not declare v0.4.0 Released");
    expect(source).toContain("v0.4.0 = Released");
    expect(source).toContain("generationId");
    expect(source).toContain("compatibleComponents");
    expect(source).toContain("Ready for Independent Verification");
    expect(source).toContain("separate GCE VM");
    expect(source).toContain("Environment Conformance Gate");
  });
});
