import { describe, expect, it } from "vitest";

import {
  validateAgentBrief,
} from "../../src/agent-brief/contract.js";
import {
  projectAgentBriefGenerationInput,
  serializeAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";

import type {
  AgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import type {
  RedmineIssue,
} from "../../src/redmine/types.js";

const PHASE_35_TEST_FINGERPRINT =
  `sha256:${"a".repeat(64)}`;

function createRepresentativeIssue(): RedmineIssue {
  return {
    id: 3603,

    project: {
      id: 414,
      name: "Redmine",
    },

    tracker: {
      id: 2,
      name: "Feature",
    },

    status: {
      id: 2,
      name: "In Progress",
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

    subject:
      "Verify bounded Agent Brief generation input",

    description:
      "Build a bounded and reproducible projection.\n" +
      "token=phase36-secret",

    customFields: [
      {
        id: 7,
        name: "Requirement",
        value:
          "Keep Phase 35 and Phase 36 boundaries compatible.",
      },
      {
        id: 8,
        name: "API Key",
        value: "must-never-be-emitted",
      },
    ],

    createdOn:
      "2026-09-06T00:00:00Z",

    updatedOn:
      "2026-09-07T00:00:00Z",

    closedOn: undefined,

    journals: Array.from(
      { length: 12 },
      (_, index) => ({
        id: index + 1,

        user: {
          id: index + 100,
          name: `Journal User ${index + 1}`,
        },

        notes:
          `clarification ${index + 1}`,

        createdOn:
          `2026-09-${String(
            index + 1,
          ).padStart(2, "0")}T00:00:00Z`,

        details: [
          {
            property: "attr",
            name: "status_id",
            oldValue: "1",
            newValue: "2",
          },
        ],
      }),
    ),

    relations: Array.from(
      { length: 25 },
      (_, index) => ({
        id: index + 1,
        issueId: 3603,
        issueToId: 4_000 + index,
        relationType:
          index % 2 === 0
            ? "relates"
            : "blocks",
      }),
    ),

    children: Array.from(
      { length: 12 },
      (_, index) => ({
        id: 5_000 + index,
        subject: `child ${index + 1}`,

        tracker: {
          id: 2,
          name: "Feature",
        },

        children: [
          {
            id: 6_000 + index,
            subject:
              `grandchild ${index + 1}`,
          },
        ],
      }),
    ),

    attachments: [
      {
        id: 1,
        filename: "internal-secret.txt",
        filesize: 42,
        contentUrl:
          "https://example.invalid/internal-secret.txt",
        createdOn:
          "2026-09-06T00:00:00Z",
      },
    ],

    allowedStatuses: [
      {
        id: 1,
        name: "New",
      },
      {
        id: 2,
        name: "In Progress",
      },
    ],
  };
}

function createPhase35CompatibilityBrief(
  input: AgentBriefGenerationInput,
): string {
  const requirementContext = [
    input.source.subject,
    input.source.description,
    ...input.requirement_custom_fields.flatMap(
      (field) =>
        Array.isArray(field.value)
          ? field.value
          : [field.value],
    ),
    ...input.journal_notes.map(
      (journal) => journal.notes,
    ),
  ]
    .filter((value) => value !== "")
    .join("\n");

  return `---
format_version: 1
redmine_issue_id: ${input.source.redmine_issue_id}
repository: mcp-mamono210/redmine
brief_revision: 1
requirements_fingerprint: ${PHASE_35_TEST_FINGERPRINT}
source_updated_on: ${input.source.source_updated_on}
---

## Agent Brief

### Goal

${input.source.subject}

### Context

${input.source.description || input.source.subject}

### In Scope

- Use the bounded Phase 36 generation input.

### Out of Scope

- Brief persistence.
- Agent execution.

### Requirements

${requirementContext}

### Architecture / Contract Constraints

- Redmine remains the requirements source of truth.
- Phase 36 does not own persistence, approval, Queue, or Agent runtime state.

### Acceptance Criteria

- [ ] AC-1: The bounded generation input can supply the Redmine-derived information required at the Phase 35 generation boundary.

### Verification

- AC-1: Validate this document with the canonical Phase 35 validateAgentBrief implementation.

### Deliverables

- A structurally valid Phase 35 Agent Brief candidate assembled from bounded Phase 36 input plus separately supplied target, revision, and fingerprint metadata.

### Unresolved / Blocking

None.
`;
}

describe(
  "Phase 36 reproducibility and Phase 35 integration",
  () => {
    it(
      "enforces bounded journals, relations, and direct children",
      () => {
        const input =
          projectAgentBriefGenerationInput(
            createRepresentativeIssue(),
            {
              requirementCustomFieldIds: [
                7,
                8,
              ],
              configuredSecrets: [
                "phase36-secret",
              ],
            },
          );

        expect(
          input.journal_notes,
        ).toHaveLength(10);

        expect(
          input.relations,
        ).toHaveLength(20);

        expect(
          input.children,
        ).toHaveLength(10);

        expect(
          input.projection.omitted
            .journal_notes,
        ).toBe(2);

        expect(
          input.projection.omitted
            .relations,
        ).toBe(5);

        expect(
          input.projection.omitted
            .children,
        ).toBe(2);

        expect(
          JSON.stringify(input.children),
        ).not.toContain("grandchild");
      },
    );

    it(
      "produces byte-equivalent canonical input regardless of association input order",
      () => {
        const firstIssue =
          createRepresentativeIssue();

        const secondIssue =
          structuredClone(firstIssue);

        secondIssue.customFields.reverse();
        secondIssue.journals?.reverse();
        secondIssue.relations?.reverse();
        secondIssue.children?.reverse();

        const policy = {
          requirementCustomFieldIds: [
            8,
            7,
          ],
          configuredSecrets: [
            "phase36-secret",
          ],
        };

        const first =
          serializeAgentBriefGenerationInput(
            projectAgentBriefGenerationInput(
              firstIssue,
              policy,
            ),
          );

        const second =
          serializeAgentBriefGenerationInput(
            projectAgentBriefGenerationInput(
              secondIssue,
              {
                ...policy,
                requirementCustomFieldIds: [
                  7,
                  8,
                ],
              },
            ),
          );

        expect(second).toBe(first);
      },
    );

    it(
      "excludes workflow metadata, history details, attachments, credentials, and runtime responsibilities",
      () => {
        const input =
          projectAgentBriefGenerationInput(
            createRepresentativeIssue(),
            {
              requirementCustomFieldIds: [
                7,
                8,
              ],
              configuredSecrets: [
                "phase36-secret",
                "must-never-be-emitted",
              ],
            },
          );

        const serialized =
          serializeAgentBriefGenerationInput(
            input,
          );

        expect(serialized).not.toContain(
          "phase36-secret",
        );

        expect(serialized).not.toContain(
          "must-never-be-emitted",
        );

        expect(serialized).not.toContain(
          "internal-secret.txt",
        );

        expect(serialized).not.toContain(
          "status_id",
        );

        expect(serialized).not.toContain(
          "Journal User",
        );

        expect(
          input.source,
        ).not.toHaveProperty("status");

        expect(
          input.source,
        ).not.toHaveProperty("priority");

        expect(
          input.source,
        ).not.toHaveProperty("author");

        expect(
          input.source,
        ).not.toHaveProperty("assigned_to");

        for (const runtimeField of [
          "queue",
          "claim",
          "lease",
          "heartbeat",
          "retry",
          "workspace",
          "execution_state",
        ]) {
          expect(input).not.toHaveProperty(
            runtimeField,
          );
        }
      },
    );

    it(
      "supplies the Redmine-derived boundary needed by the Phase 35 Agent Brief contract",
      () => {
        const input =
          projectAgentBriefGenerationInput(
            createRepresentativeIssue(),
            {
              requirementCustomFieldIds: [
                7,
              ],
              configuredSecrets: [
                "phase36-secret",
              ],
            },
          );

        const candidate =
          createPhase35CompatibilityBrief(
            input,
          );

        const result =
          validateAgentBrief(candidate);

        expect(result.success).toBe(true);

        if (!result.success) {
          throw new Error(
            JSON.stringify(result.issues),
          );
        }

        expect(
          result.data.metadata
            .redmine_issue_id,
        ).toBe(
          input.source.redmine_issue_id,
        );

        expect(
          result.data.metadata
            .source_updated_on,
        ).toBe(
          input.source.source_updated_on,
        );

        expect(
          result.data.sections.Goal,
        ).toBe(input.source.subject);
      },
    );

    it(
      "keeps the canonical serialized input inside the Phase 36 byte ceiling",
      () => {
        const issue =
          createRepresentativeIssue();

        issue.description =
          "界".repeat(10_000);

        const serialized =
          serializeAgentBriefGenerationInput(
            projectAgentBriefGenerationInput(
              issue,
              {
                requirementCustomFieldIds: [
                  7,
                ],
              },
            ),
          );

        expect(
          Buffer.byteLength(
            serialized,
            "utf8",
          ),
        ).toBeLessThanOrEqual(
          24_576,
        );
      },
    );
  },
);
