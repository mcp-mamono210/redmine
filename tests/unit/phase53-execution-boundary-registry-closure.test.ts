import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PHASE53 = resolve(ROOT, "scripts/phase53");
const PREPARE = resolve(PHASE53, "prepare-agent-runner-execution-boundary-registry-commit.mjs");
const VERIFY = resolve(PHASE53, "verify-agent-runner-execution-boundary-registry-closure.mjs");
const REGISTRY = resolve(ROOT, "docs/contracts/system-release-compatibility-contract-registry.json");

interface RegistryEntry {
  contractId: string;
  semanticRevision: number;
  registrationState: string;
}

interface Registry {
  contracts: RegistryEntry[];
}

function executionBoundaryEntry(): RegistryEntry {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as Registry;
  const entry = registry.contracts.find(
    (candidate) => candidate.contractId === "agent-runner-execution-boundary",
  );
  if (entry === undefined) {
    throw new Error("agent-runner-execution-boundary registry entry is missing");
  }
  return entry;
}

describe("Phase 53-3 execution-boundary registry closure", () => {
  it("keeps both Phase 53 helper scripts syntactically valid", () => {
    for (const script of [PREPARE, VERIFY]) {
      expect(() => execFileSync(process.execPath, ["--check", script], { encoding: "utf8" })).not.toThrow();
    }
  });

  it("records semantic revision 2 rules in the canonical contract and keeps implementation constants non-portable", () => {
    const contract = readFileSync(
      resolve(ROOT, "docs/contracts/agent-runner-execution-boundary-contract.md"),
      "utf8",
    ).replace(/\s+/gu, " ");

    expect(contract).toContain("One Issue = at most one Agent execution attempt");
    expect(contract).toContain("list-response predicate mismatch");
    expect(contract).toContain("post-list state change");
    expect(contract).toContain("bounded scan");
    expect(contract).toContain("scan bound of `100`");
    expect(contract).toContain("not portable contract constants");
    expect(contract).toContain("compatibilityImpact = none");
  });

  it("preserves ADR-027 Accepted Decision and adds the dated Phase 53 addendum", () => {
    const adr = readFileSync(
      resolve(ROOT, "docs/adr/ADR-027-use-pull-based-single-worker-agent-controller.md"),
      "utf8",
    );
    expect(adr).toContain("Status: Accepted");
    expect(adr).toContain("Phase 53 Addendum (2026-09-27, refs #5450)");
    expect(adr).toContain("original Accepted Decision above remains unchanged");
  });

  it("makes Commit A non-final and requires exact closure after Commit B", () => {
    const entry = executionBoundaryEntry();
    if (entry.semanticRevision === 1) {
      expect(() => execFileSync(process.execPath, [VERIFY, "--root", ROOT], { encoding: "utf8" })).toThrow();
      return;
    }

    expect(entry.semanticRevision).toBe(2);
    expect(entry.registrationState).toBe("committed");
    const output = execFileSync(
      process.execPath,
      [VERIFY, "--root", ROOT, "--mode", "pre-merge", "--negative-controls"],
      { encoding: "utf8" },
    );
    expect(output).toContain("registry closure PASS");
    expect(output).toContain("negativeControls=PASS");
  });

  it("documents the current pending-first-commit validator mismatch and the two-commit variant", () => {
    const runbook = readFileSync(resolve(PHASE53, "README.md"), "utf8");
    expect(runbook).toContain("permits `pending-first-commit` only for");
    expect(runbook).toContain("Commit A");
    expect(runbook).toContain("Commit B");
    expect(runbook).toContain("Use a merge commit");
    expect(runbook).toContain("Post-merge closure");
  });
});
