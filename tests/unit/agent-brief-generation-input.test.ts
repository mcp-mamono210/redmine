import { describe, expect, it } from "vitest";

import {
  projectAgentBriefGenerationInput,
  serializeAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";

import type { RedmineIssue } from "../../src/redmine/types.js";

function createIssueFixture(): RedmineIssue {
  return {
    id: 1234,

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
      name: "Author",
    },

    subject: " Brief projection ",

    description:
      "Requirement\r\n" +
      "token=secret-value",

    customFields: [
      {
        id: 7,
        name: "Requirement",
        value: "keep",
      },
      {
        id: 8,
        name: "API Key",
        value: "drop",
      },
    ],

    updatedOn: "2026-09-06T00:00:00Z",

    journals: Array.from(
      { length: 12 },
      (_, index) => ({
        id: index + 1,

        user: {
          id: 1,
          name: "u",
        },

        notes: `note ${index + 1}`,

        createdOn:
          `2026-09-${String(index + 1).padStart(2, "0")}` +
          "T00:00:00Z",

        details: [],
      }),
    ),

    relations: [
      {
        id: 1,
        issueId: 1234,
        issueToId: 99,
        relationType: "relates",
      },
    ],

    children: [
      {
        id: 10,
        subject: "child",

        children: [
          {
            id: 11,
            subject: "grandchild",
          },
        ],
      },
    ],
  };
}

describe("bounded generation input", () => {
  it(
    "bounds context and filters credential-sensitive data",
    () => {
      const result =
        projectAgentBriefGenerationInput(
          createIssueFixture(),
          {
            requirementCustomFieldIds: [7, 8],
            configuredSecrets: [
              "secret-value",
            ],
          },
        );

      expect(
        result.journal_notes,
      ).toHaveLength(10);

      expect(
        result.requirement_custom_fields,
      ).toEqual([
        {
          id: 7,
          name: "Requirement",
          value: "keep",
        },
      ]);

      const serialized =
        JSON.stringify(result);

      expect(
        serialized,
      ).not.toContain("grandchild");

      expect(
        serialized,
      ).not.toContain("secret-value");
    },
  );

  it(
    "produces deterministic serialized output",
    () => {
      const first =
        serializeAgentBriefGenerationInput(
          projectAgentBriefGenerationInput(
            createIssueFixture(),
            {
              requirementCustomFieldIds: [7],
            },
          ),
        );

      const second =
        serializeAgentBriefGenerationInput(
          projectAgentBriefGenerationInput(
            createIssueFixture(),
            {
              requirementCustomFieldIds: [7],
            },
          ),
        );

      expect(second).toBe(first);
    },
  );

  it(
    "rejects a relation that does not reference the source Issue",
    () => {
      const issue = createIssueFixture();

      issue.relations = [
        {
          id: 1,
          issueId: 1,
          issueToId: 2,
          relationType: "relates",
        },
      ];

      expect(() =>
        projectAgentBriefGenerationInput(
          issue,
        ),
      ).toThrow();
    },
  );

  it(
    "keeps serialized generation input within the final byte budget",
    () => {
      const issue = createIssueFixture();

      issue.description =
        "界".repeat(10_000);

      const result =
        projectAgentBriefGenerationInput(
          issue,
        );

      const serialized =
        serializeAgentBriefGenerationInput(
          result,
        );

      expect(
        Buffer.byteLength(
          serialized,
          "utf8",
        ),
      ).toBeLessThanOrEqual(24_576);
    },
  );
});
