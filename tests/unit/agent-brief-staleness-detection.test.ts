import { describe, expect, it } from "vitest";

import type { AgentBriefGenerationInput } from "../../src/agent-brief/generation-input.js";
import type { PersistedAgentBrief } from "../../src/agent-brief/persistence.js";
import {
  calculateAgentBriefRequirementsFingerprint,
} from "../../src/agent-brief/requirements-fingerprint.js";
import {
  detectAgentBriefRequirementsStaleness,
} from "../../src/agent-brief/staleness-detection.js";

function generationInput(): AgentBriefGenerationInput {
  return {
    format_version: 1,
    source: {
      redmine_issue_id: 5369,
      source_updated_on: "2026-09-07T00:00:00Z",
      project: {
        id: 414,
        name: "Redmine",
      },
      tracker: {
        id: 2,
        name: "Feature",
      },
      fixed_version: {
        id: 29,
        name: "0.3.0",
      },
      subject: "Requirements staleness detection",
      description: "Compare persisted and current requirements fingerprints.",
    },
    requirement_custom_fields: [
      {
        id: 21,
        name: "Requirement",
        value: "Preserve deterministic comparison semantics.",
      },
    ],
    journal_notes: [],
    relations: [],
    children: [],
    projection: {
      requirement_custom_field_ids: [21],
      redacted_paths: [],
      truncated_paths: [],
      omitted: {
        requirement_custom_fields: 0,
        journal_notes: 0,
        relations: 0,
        children: 0,
      },
    },
  };
}

function briefMarkdown(
  fingerprint: string,
  redmineIssueId = 5369,
  briefRevision = 1,
): string {
  return `---
format_version: 1
redmine_issue_id: ${redmineIssueId}
repository: mcp-mamono210/redmine
brief_revision: ${briefRevision}
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Detect whether the persisted Brief still matches current requirements.

### Context

Phase 39 compares deterministic requirements fingerprints before approval.

### In Scope

- Compare one persisted Brief fingerprint with current requirements.

### Out of Scope

- Lifecycle mutation.
- Approval orchestration.

### Requirements

- Return CURRENT only for equal canonical fingerprints.
- Return STALE for unequal canonical fingerprints.

### Architecture / Contract Constraints

- Do not use updated_on as a staleness decision.
- Do not mutate Redmine lifecycle state.

### Acceptance Criteria

- [ ] AC-1: Equal fingerprints are CURRENT and unequal fingerprints are STALE.

### Verification

- AC-1: Exercise the Phase 39-3 staleness detection boundary.

### Deliverables

- A deterministic staleness result.

### Unresolved / Blocking

None.
`;
}

function persistedBrief(
  input = generationInput(),
): PersistedAgentBrief {
  const fingerprint =
    calculateAgentBriefRequirementsFingerprint(input);

  return {
    repository: "mcp-mamono210/redmine",
    artifactPath: "docs/agent-briefs/5369/revisions/1.md",
    redmineIssueId: 5369,
    briefRevision: 1,
    persistedRevision: "0123456789abcdef",
    markdown: briefMarkdown(fingerprint),
  };
}

describe("Agent Brief requirements staleness detection", () => {
  it("returns CURRENT for the same persisted and current requirements", () => {
    const input = generationInput();
    const persisted = persistedBrief(input);

    expect(
      detectAgentBriefRequirementsStaleness(persisted, input),
    ).toMatchObject({
      kind: "CURRENT",
      redmineIssueId: 5369,
      briefRevision: 1,
      persistedRevision: "0123456789abcdef",
      persistedFingerprint:
        calculateAgentBriefRequirementsFingerprint(input),
      currentFingerprint:
        calculateAgentBriefRequirementsFingerprint(input),
    });
  });

  it("returns STALE when requirement-bearing content changes", () => {
    const original = generationInput();
    const persisted = persistedBrief(original);
    const changed = structuredClone(original);

    changed.source.description =
      "Changed implementation requirements after Brief persistence.";

    const result =
      detectAgentBriefRequirementsStaleness(persisted, changed);

    expect(result.kind).toBe("STALE");
    if (result.kind === "STALE") {
      expect(result.currentFingerprint).not.toBe(
        result.persistedFingerprint,
      );
    }
  });

  it("does not use source_updated_on as a staleness decision", () => {
    const original = generationInput();
    const persisted = persistedBrief(original);
    const changedTimestamp = structuredClone(original);

    changedTimestamp.source.source_updated_on =
      "2026-09-08T00:00:00Z";

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        changedTimestamp,
      ).kind,
    ).toBe("CURRENT");
  });

  it("rejects missing or malformed persisted fingerprints as INVALID_REFERENCE", () => {
    const input = generationInput();
    const persisted = persistedBrief(input);

    const missing = structuredClone(persisted);
    missing.markdown = missing.markdown.replace(
      /^requirements_fingerprint:.*\n/mu,
      "",
    );

    const malformed = structuredClone(persisted);
    malformed.markdown = malformed.markdown.replace(
      /^requirements_fingerprint:.*$/mu,
      "requirements_fingerprint: not-a-fingerprint",
    );

    expect(
      detectAgentBriefRequirementsStaleness(missing, input).kind,
    ).toBe("INVALID_REFERENCE");
    expect(
      detectAgentBriefRequirementsStaleness(malformed, input).kind,
    ).toBe("INVALID_REFERENCE");
  });

  it("rejects persisted-reference and current-Issue identity mismatches", () => {
    const input = generationInput();
    const persisted = persistedBrief(input);

    const mismatchedPersistence = structuredClone(persisted);
    mismatchedPersistence.briefRevision = 2;

    expect(
      detectAgentBriefRequirementsStaleness(
        mismatchedPersistence,
        input,
      ).kind,
    ).toBe("INVALID_REFERENCE");

    const mismatchedPath = structuredClone(persisted);
    mismatchedPath.artifactPath =
      "docs/agent-briefs/5369/revisions/2.md";

    expect(
      detectAgentBriefRequirementsStaleness(
        mismatchedPath,
        input,
      ).kind,
    ).toBe("INVALID_REFERENCE");

    const otherIssue = structuredClone(input);
    otherIssue.source.redmine_issue_id = 5370;

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        otherIssue,
      ).kind,
    ).toBe("INVALID_REFERENCE");
  });

  it("returns FINGERPRINT_UNAVAILABLE instead of STALE when generation fails", () => {
    const input = generationInput();
    const persisted = persistedBrief(input);
    const unsupported = structuredClone(input) as unknown as {
      format_version: number;
    };

    unsupported.format_version = 2;

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        unsupported as unknown as AgentBriefGenerationInput,
      ).kind,
    ).toBe("FINGERPRINT_UNAVAILABLE");
  });

  it("does not mutate the persisted Brief or current generation input", () => {
    const input = generationInput();
    const persisted = persistedBrief(input);
    const inputBefore = structuredClone(input);
    const persistedBefore = structuredClone(persisted);

    detectAgentBriefRequirementsStaleness(persisted, input);

    expect(input).toEqual(inputBefore);
    expect(persisted).toEqual(persistedBefore);
  });
});
