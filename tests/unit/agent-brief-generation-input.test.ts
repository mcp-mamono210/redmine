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
          `2026-09-${String(
            index + 1,
          ).padStart(2, "0")}` +
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

describe(
  "Agent Brief bounded generation input",
  () => {
    it(
      "bounds context and filters credential-sensitive data",
      () => {
        const result =
          projectAgentBriefGenerationInput(
            createIssueFixture(),
            {
              requirementCustomFieldIds: [
                7,
                8,
              ],
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
        ).not.toContain(
          "secret-value",
        );
      },
    );

    it(
      "records custom-field metadata paths by output array index",
      () => {
        const issue =
          createIssueFixture();

        issue.customFields = [
          {
            id: 7,
            name: "Requirement",
            value:
              "token=field-secret",
          },
          {
            id: 8,
            name: "API Key",
            value: "excluded",
          },
        ];

        const result =
          projectAgentBriefGenerationInput(
            issue,
            {
              requirementCustomFieldIds: [
                7,
                8,
              ],
              configuredSecrets: [
                "field-secret",
              ],
            },
          );

        expect(
          result.projection
            .redacted_paths,
        ).toContain(
          "requirement_custom_fields[0].value",
        );

        expect(
          result.projection
            .redacted_paths,
        ).not.toContain(
          "requirement_custom_fields.7.value",
        );
      },
    );

    it(
      "produces deterministic serialized output for the same secret set",
      () => {
        const first =
          serializeAgentBriefGenerationInput(
            projectAgentBriefGenerationInput(
              createIssueFixture(),
              {
                requirementCustomFieldIds: [
                  7,
                ],
                configuredSecrets: [
                  "secret-value",
                  "Requirement",
                ],
              },
            ),
          );

        const second =
          serializeAgentBriefGenerationInput(
            projectAgentBriefGenerationInput(
              createIssueFixture(),
              {
                requirementCustomFieldIds: [
                  7,
                ],
                configuredSecrets: [
                  "Requirement",
                  "secret-value",
                ],
              },
            ),
          );

        expect(second).toBe(first);
      },
    );

    it(
      "rejects a non-RFC3339 source timestamp",
      () => {
        const issue =
          createIssueFixture();

        issue.updatedOn =
          "2026/09/06 00:00:00";

        expect(() =>
          projectAgentBriefGenerationInput(
            issue,
          ),
        ).toThrow(
          "required Redmine Issue identity is missing or invalid",
        );
      },
    );

    it(
      "rejects a relation that does not reference the source Issue",
      () => {
        const issue =
          createIssueFixture();

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
      "reduces highest-ID custom-field values before truncating description",
      () => {
        const issue =
          createIssueFixture();

        issue.journals = [];
        issue.relations = [];
        issue.children = [];

        issue.description =
          "d".repeat(8_192);

        issue.customFields =
          Array.from(
            { length: 8 },
            (_, index) => ({
              id: 10 + index,
              name:
                `Requirement ${index}`,
              value: Array.from(
                { length: 4 },
                () =>
                  "v".repeat(1_024),
              ),
            }),
          );

        const ids =
          issue.customFields.map(
            (field) => field.id,
          );

        const result =
          projectAgentBriefGenerationInput(
            issue,
            {
              requirementCustomFieldIds:
                ids,
            },
          );

        const highestField =
          result.requirement_custom_fields[
            result
              .requirement_custom_fields
              .length - 1
          ];

        expect(
          highestField?.id,
        ).toBe(17);

        expect(
          highestField?.value,
        ).toEqual([
          "…",
          "…",
          "…",
          "…",
        ]);

        expect(
          result.projection
            .truncated_paths,
        ).toContain(
          "requirement_custom_fields[7].value",
        );

        expect(
          result.source.description,
        ).toBe(
          "d".repeat(8_192),
        );
      },
    );

    it(
      "keeps serialized generation input within the final byte budget",
      () => {
        const issue =
          createIssueFixture();

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
        ).toBeLessThanOrEqual(
          24_576,
        );
      },
    );
  },
);
