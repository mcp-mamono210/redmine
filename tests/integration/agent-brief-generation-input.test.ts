import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  projectAgentBriefGenerationInput,
  serializeAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  RedmineClient,
} from "../../src/redmine/client.js";
import {
  createReadOnlyTestClient,
  getRedmineReadOnlyTestEnvironment,
} from "../helpers/redmine-environment.js";
import {
  AUTHENTICATION_FIXTURE_SUBJECT,
  findSeededIssue,
} from "../helpers/redmine-fixtures.js";

const {
  readOnlyApiKey,
} = getRedmineReadOnlyTestEnvironment();

describe(
  "Agent Brief generation input integration",
  () => {
    let client: RedmineClient;

    beforeAll(() => {
      client = createReadOnlyTestClient();
    });

    it(
      "projects the same seeded Redmine state to byte-equivalent generation input",
      async () => {
        const target =
          await findSeededIssue(
            client,
            AUTHENTICATION_FIXTURE_SUBJECT,
          );

        const include = [
          "journals",
          "relations",
          "children",
        ] as const;

        const firstIssue =
          await client.getIssue(
            target.id,
            {
              include,
            },
          );

        const secondIssue =
          await client.getIssue(
            target.id,
            {
              include,
            },
          );

        const policy = {
          configuredSecrets: [
            readOnlyApiKey,
          ],
        };

        const firstInput =
          projectAgentBriefGenerationInput(
            firstIssue,
            policy,
          );

        const secondInput =
          projectAgentBriefGenerationInput(
            secondIssue,
            policy,
          );

        const firstSerialized =
          serializeAgentBriefGenerationInput(
            firstInput,
          );

        const secondSerialized =
          serializeAgentBriefGenerationInput(
            secondInput,
          );

        expect(secondSerialized).toBe(
          firstSerialized,
        );

        expect(
          firstInput.source
            .redmine_issue_id,
        ).toBe(target.id);

        expect(
          firstInput.journal_notes.length,
        ).toBeLessThanOrEqual(10);

        expect(
          firstInput.relations.length,
        ).toBeLessThanOrEqual(20);

        expect(
          firstInput.children.length,
        ).toBeLessThanOrEqual(10);

        expect(
          Buffer.byteLength(
            firstSerialized,
            "utf8",
          ),
        ).toBeLessThanOrEqual(
          24_576,
        );

        expect(
          firstSerialized,
        ).not.toContain(readOnlyApiKey);

        expect(
          firstInput.source,
        ).not.toHaveProperty("status");

        expect(
          firstInput.source,
        ).not.toHaveProperty("priority");

        expect(
          firstInput.source,
        ).not.toHaveProperty("author");

        expect(firstInput).not.toHaveProperty(
          "attachments",
        );

        expect(firstInput).not.toHaveProperty(
          "allowed_statuses",
        );
      },
    );
  },
);
