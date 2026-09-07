import { describe, expect, it } from "vitest";

import {
  projectAgentBriefGenerationInput,
  type AgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  AgentBriefRequirementsFingerprintError,
  buildAgentBriefRequirementsFingerprintPayload,
  calculateAgentBriefRequirementsFingerprint,
  serializeAgentBriefRequirementsFingerprintPayload,
} from "../../src/agent-brief/requirements-fingerprint.js";
import type { RedmineIssue } from "../../src/redmine/types.js";

const CANONICAL_FINGERPRINT =
  "sha256:421a17880d514fa7f8446f3391e418f5b8b114f83deab95bc8d3417f715260fe";

function canonicalGenerationInput(): AgentBriefGenerationInput {
  return {
    format_version: 1,
    source: {
      redmine_issue_id: 5368,
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
      subject: "Requirements fingerprint",
      description: "Same requirements produce the same fingerprint.",
    },
    requirement_custom_fields: [],
    journal_notes: [],
    relations: [],
    children: [],
    projection: {
      requirement_custom_field_ids: [],
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

function createIssueFixture(): RedmineIssue {
  return {
    id: 5368,
    project: {
      id: 414,
      name: "Redmine",
    },
    tracker: {
      id: 2,
      name: "Feature",
    },
    status: {
      id: 1,
      name: "New",
    },
    priority: {
      id: 2,
      name: "Normal",
    },
    author: {
      id: 10,
      name: "Chat GPT",
    },
    assignedTo: {
      id: 3,
      name: "mamono 210",
    },
    fixedVersion: {
      id: 29,
      name: "0.3.0",
    },
    subject: "Deterministic fingerprint",
    description: "Implement the fingerprint generator.",
    customFields: [
      {
        id: 21,
        name: "Requirement",
        value: "preserve deterministic semantics",
      },
      {
        id: 90,
        name: "Brief Approved By",
        value: "redmine-user:3",
      },
      {
        id: 91,
        name: "Agent Brief Lifecycle",
        value: "Brief Ready",
      },
    ],
    updatedOn: "2026-09-07T00:00:00Z",
    journals: [
      {
        id: 2,
        user: {
          id: 3,
          name: "mamono 210",
        },
        notes: "Second requirement clarification",
        createdOn: "2026-09-07T02:00:00Z",
        details: [],
      },
      {
        id: 1,
        user: {
          id: 3,
          name: "mamono 210",
        },
        notes: "First requirement clarification",
        createdOn: "2026-09-07T01:00:00Z",
        details: [],
      },
    ],
    relations: [
      {
        id: 20,
        issueId: 5368,
        issueToId: 8002,
        relationType: "relates",
      },
      {
        id: 19,
        issueId: 5368,
        issueToId: 8001,
        relationType: "blocks",
        delay: 0,
      },
    ],
    children: [
      {
        id: 7002,
        subject: "Second child requirement",
      },
      {
        id: 7001,
        subject: "First child requirement",
        tracker: {
          id: 2,
          name: "Feature",
        },
      },
    ],
  };
}

function project(issue: RedmineIssue): AgentBriefGenerationInput {
  return projectAgentBriefGenerationInput(issue, {
    requirementCustomFieldIds: [21],
  });
}

function fingerprint(issue: RedmineIssue): string {
  return calculateAgentBriefRequirementsFingerprint(project(issue));
}

function mutateIssue(
  mutate: (issue: RedmineIssue) => void,
): RedmineIssue {
  const issue = structuredClone(createIssueFixture());
  mutate(issue);
  return issue;
}

describe("Agent Brief requirements fingerprint", () => {
  it("matches the Phase 39-1 canonical SHA-256 test vector", () => {
    expect(
      calculateAgentBriefRequirementsFingerprint(canonicalGenerationInput()),
    ).toBe(CANONICAL_FINGERPRINT);
  });

  it("constructs the exact canonical semantic payload and serialization", () => {
    const payload = buildAgentBriefRequirementsFingerprintPayload(
      canonicalGenerationInput(),
    );

    expect(payload).toEqual({
      format_version: 1,
      scope: {
        project_id: 414,
        tracker_id: 2,
        fixed_version_id: 29,
      },
      subject: "Requirements fingerprint",
      description: "Same requirements produce the same fingerprint.",
      requirement_custom_fields: [],
      journal_notes: [],
      relations: [],
      children: [],
    });

    expect(serializeAgentBriefRequirementsFingerprintPayload(payload)).toBe(
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  });

  it("produces the same fingerprint for repeated projection of the same requirements", () => {
    const issue = createIssueFixture();

    expect(fingerprint(structuredClone(issue))).toBe(
      fingerprint(structuredClone(issue)),
    );
  });

  it("is independent of raw Redmine association ordering after Phase 36 projection", () => {
    const first = createIssueFixture();
    const second = structuredClone(first);

    second.customFields.reverse();
    second.journals?.reverse();
    second.relations?.reverse();
    second.children?.reverse();

    expect(fingerprint(second)).toBe(fingerprint(first));
  });

  it("changes when requirement-bearing subject, description, or custom-field values change", () => {
    const baseline = fingerprint(createIssueFixture());

    const subjectChanged = mutateIssue((issue) => {
      issue.subject = "Changed deterministic fingerprint";
    });
    const descriptionChanged = mutateIssue((issue) => {
      issue.description = "Changed implementation requirement.";
    });
    const customFieldChanged = mutateIssue((issue) => {
      const requirementField = issue.customFields.find((field) => field.id === 21);

      if (requirementField === undefined) {
        throw new Error("fixture requirement custom field is missing");
      }

      requirementField.value = "changed requirement custom field";
    });

    expect(fingerprint(subjectChanged)).not.toBe(baseline);
    expect(fingerprint(descriptionChanged)).not.toBe(baseline);
    expect(fingerprint(customFieldChanged)).not.toBe(baseline);
  });

  it("changes when retained journal, relation, or child requirement semantics change", () => {
    const baseline = fingerprint(createIssueFixture());

    const journalChanged = mutateIssue((issue) => {
      if (issue.journals === undefined || issue.journals[0] === undefined) {
        throw new Error("fixture journal is missing");
      }

      issue.journals[0].notes = "Changed clarification";
    });
    const relationChanged = mutateIssue((issue) => {
      if (issue.relations === undefined || issue.relations[0] === undefined) {
        throw new Error("fixture relation is missing");
      }

      issue.relations[0].issueToId = 9000;
    });
    const childChanged = mutateIssue((issue) => {
      if (issue.children === undefined || issue.children[0] === undefined) {
        throw new Error("fixture child is missing");
      }

      issue.children[0].subject = "Changed child requirement";
    });

    expect(fingerprint(journalChanged)).not.toBe(baseline);
    expect(fingerprint(relationChanged)).not.toBe(baseline);
    expect(fingerprint(childChanged)).not.toBe(baseline);
  });

  it("ignores status, assignee, approval-only metadata, and updated_on changes", () => {
    const baseline = fingerprint(createIssueFixture());

    const workflowChanged = mutateIssue((issue) => {
      issue.status = {
        id: 2,
        name: "In Progress",
      };
      issue.assignedTo = {
        id: 99,
        name: "Another User",
      };
      issue.updatedOn = "2026-09-08T00:00:00Z";

      for (const field of issue.customFields) {
        if (field.id === 90) {
          field.value = "redmine-user:99";
        }

        if (field.id === 91) {
          field.value = "Ready for Agent";
        }
      }
    });

    expect(fingerprint(workflowChanged)).toBe(baseline);
  });

  it("ignores Phase 36 audit and projection-only metadata", () => {
    const baseline = canonicalGenerationInput();
    const changed = structuredClone(baseline);

    changed.source.redmine_issue_id = 9999;
    changed.source.source_updated_on = "2026-09-08T00:00:00Z";
    changed.source.project.name = "Renamed Project";
    changed.source.tracker.name = "Renamed Tracker";
    changed.source.fixed_version = {
      id: 29,
      name: "Renamed Version",
    };
    changed.projection.redacted_paths = ["source.description"];
    changed.projection.truncated_paths = ["source.subject"];
    changed.projection.omitted.journal_notes = 7;

    expect(calculateAgentBriefRequirementsFingerprint(changed)).toBe(
      calculateAgentBriefRequirementsFingerprint(baseline),
    );
  });

  it("retains stable project, tracker, and fixed-version IDs as scope anchors", () => {
    const baseline = canonicalGenerationInput();

    const projectChanged = structuredClone(baseline);
    projectChanged.source.project.id = 415;

    const trackerChanged = structuredClone(baseline);
    trackerChanged.source.tracker.id = 3;

    const versionChanged = structuredClone(baseline);
    versionChanged.source.fixed_version = {
      id: 30,
      name: "0.4.0",
    };

    expect(calculateAgentBriefRequirementsFingerprint(projectChanged)).not.toBe(
      CANONICAL_FINGERPRINT,
    );
    expect(calculateAgentBriefRequirementsFingerprint(trackerChanged)).not.toBe(
      CANONICAL_FINGERPRINT,
    );
    expect(calculateAgentBriefRequirementsFingerprint(versionChanged)).not.toBe(
      CANONICAL_FINGERPRINT,
    );
  });

  it("fails closed for unsupported or malformed Phase 36 generation input", () => {
    const unsupported = structuredClone(canonicalGenerationInput()) as unknown as {
      format_version: number;
    };
    unsupported.format_version = 2;

    expect(() =>
      calculateAgentBriefRequirementsFingerprint(
        unsupported as unknown as AgentBriefGenerationInput,
      ),
    ).toThrow(AgentBriefRequirementsFingerprintError);

    const malformed = structuredClone(canonicalGenerationInput());
    malformed.source.source_updated_on = "not-a-timestamp";

    expect(() => calculateAgentBriefRequirementsFingerprint(malformed)).toThrow(
      "source.source_updated_on",
    );
  });
});
