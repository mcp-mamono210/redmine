import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AGENT_BRIEF_FORMAT_VERSION,
  AGENT_BRIEF_REQUIRED_SECTIONS,
  validateAgentBrief,
} from "../../src/agent-brief/contract.js";

const validBrief = `---
format_version: 1
redmine_issue_id: 1234
repository: example/agent-project
brief_revision: 1
requirements_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

## Agent Brief

### Goal

Establish one testable contract.

### Context

The consumer needs a bounded implementation instruction.

### In Scope

- Contract validation.

### Out of Scope

- Runtime orchestration.

### Requirements

- Reject incomplete input.

### Architecture / Contract Constraints

- Keep runtime state outside the artifact.

### Acceptance Criteria

- [ ] AC-1: A valid document is accepted.
- [ ] AC-2: Missing required content is rejected.

### Verification

- AC-1: Run the configured contract validator and confirm success.
- AC-2: Remove one required section and confirm a validation issue.

### Deliverables

- The validated Agent Brief.

### Unresolved / Blocking

None.
`;

function issueCodes(markdown: string): string[] {
  const result = validateAgentBrief(markdown);
  return result.success
    ? []
    : result.issues.map((issue) => issue.code);
}

describe("Agent Brief v1 contract", () => {
  it("validates the canonical example tracked with the contract", async () => {
    const exampleUrl = new URL(
      "../../docs/contracts/examples/agent-brief-v1.md",
      import.meta.url,
    );
    const example = await readFile(exampleUrl, "utf8");
    const result = validateAgentBrief(example);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.metadata).toMatchObject({
      format_version: AGENT_BRIEF_FORMAT_VERSION,
      redmine_issue_id: 1234,
      repository: "example/agent-project",
      brief_revision: 1,
    });
    expect(Object.keys(result.data.sections)).toEqual(
      AGENT_BRIEF_REQUIRED_SECTIONS,
    );
    expect(result.data.acceptanceCriteriaIds).toEqual(["AC-1", "AC-2"]);
  });

  it("accepts implementation_target instead of repository", () => {
    const result = validateAgentBrief(
      validBrief.replace(
        "repository: example/agent-project",
        "implementation_target: shared-agent-platform",
      ),
    );

    expect(result.success).toBe(true);
  });

  it("requires exactly one implementation target", () => {
    const withoutTarget = validBrief.replace(
      "repository: example/agent-project\n",
      "",
    );
    const withBothTargets = validBrief.replace(
      "repository: example/agent-project",
      "repository: example/agent-project\nimplementation_target: shared-agent-platform",
    );

    expect(issueCodes(withoutTarget)).toContain("metadata_invalid");
    expect(issueCodes(withBothTargets)).toContain("metadata_invalid");
  });

  it("distinguishes an unsupported format version", () => {
    expect(
      issueCodes(validBrief.replace("format_version: 1", "format_version: 2")),
    ).toContain("unsupported_format_version");
  });

  it("rejects an invalid requirements fingerprint", () => {
    expect(
      issueCodes(
        validBrief.replace(
          /requirements_fingerprint: .+/u,
          "requirements_fingerprint: sha256:not-a-digest",
        ),
      ),
    ).toContain("metadata_invalid");
  });

  it.each(["status", "queue", "lease", "workspace", "execution_state"])(
    "rejects the runtime field %s",
    (field) => {
      const brief = validBrief.replace(
        "brief_revision: 1",
        `brief_revision: 1\n${field}: pending`,
      );

      expect(issueCodes(brief)).toContain("runtime_field_forbidden");
    },
  );

  it("rejects unknown and duplicate metadata", () => {
    const unknown = validBrief.replace(
      "brief_revision: 1",
      "brief_revision: 1\ncustom_value: unexpected",
    );
    const duplicate = validBrief.replace(
      "brief_revision: 1",
      "brief_revision: 1\nbrief_revision: 2",
    );

    expect(issueCodes(unknown)).toContain("metadata_unknown");
    expect(issueCodes(duplicate)).toContain("metadata_duplicate");
  });

  it("reports a missing, empty, duplicate, or reordered section", () => {
    const missing = validBrief.replace(
      /### Deliverables\n\n- The validated Agent Brief\.\n\n/u,
      "",
    );
    const empty = validBrief.replace(
      "### Goal\n\nEstablish one testable contract.",
      "### Goal\n",
    );
    const duplicate = validBrief.replace(
      "### Context",
      "### Goal\n\nA duplicate goal.\n\n### Context",
    );
    const reordered = validBrief
      .replace("### Goal", "### TEMP")
      .replace("### Context", "### Goal")
      .replace("### TEMP", "### Context");

    expect(issueCodes(missing)).toContain("section_missing");
    expect(issueCodes(empty)).toContain("section_empty");
    expect(issueCodes(duplicate)).toContain("section_duplicate");
    expect(issueCodes(reordered)).toContain("section_order_invalid");
  });

  it("does not interpret headings inside fenced code blocks as sections", () => {
    const withCodeFence = validBrief.replace(
      "- Contract validation.",
      "- Contract validation.\n\n```text\n### Not A Section\n```",
    );

    expect(validateAgentBrief(withCodeFence).success).toBe(true);
  });

  it("requires unchecked, uniquely identified acceptance criteria", () => {
    const checked = validBrief.replace("- [ ] AC-1:", "- [x] AC-1:");
    const unidentified = validBrief.replace("- [ ] AC-1:", "- [ ] Valid:");
    const duplicate = validBrief.replace("- [ ] AC-2:", "- [ ] AC-1:");

    expect(issueCodes(checked)).toContain(
      "acceptance_criteria_state_forbidden",
    );
    expect(issueCodes(unidentified)).toContain(
      "acceptance_criteria_invalid",
    );
    expect(issueCodes(duplicate)).toContain(
      "acceptance_criteria_duplicate",
    );
  });

  it("requires verification coverage for every acceptance criterion", () => {
    const missingReference = validBrief.replace(
      "- AC-2: Remove one required section and confirm a validation issue.\n",
      "",
    );
    const unknownReference = validBrief.replace(
      "- AC-2: Remove one required section and confirm a validation issue.",
      "- AC-3: Run an unrelated check.",
    );

    expect(issueCodes(missingReference)).toContain(
      "verification_reference_missing",
    );
    expect(issueCodes(unknownReference)).toEqual(
      expect.arrayContaining([
        "verification_reference_unknown",
        "verification_reference_missing",
      ]),
    );
  });
});
