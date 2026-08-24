import { beforeAll, describe, expect, it } from "vitest";

import {
  RedmineClient,
} from "../../src/redmine/client.js";
import { RedmineHttpError } from "../../src/redmine/errors.js";
import {
  createReadOnlyTestClient,
  getRedmineReadOnlyTestEnvironment,
} from "../helpers/redmine-environment.js";
import {
  AUTHENTICATION_FIXTURE_SUBJECT,
  JOURNAL_FIXTURE_SUBJECT,
  PRIMARY_TEST_PROJECT_IDENTIFIER,
  findSeededIssue,
} from "../helpers/redmine-fixtures.js";

const {
  redmineUrl,
  readOnlyApiKey,
} = getRedmineReadOnlyTestEnvironment();

describe("RedmineClient integration", () => {
  let client: RedmineClient;

  beforeAll(() => {
    client = createReadOnlyTestClient();
  });

  it("retrieves the current seeded Redmine user without exposing the API key", async () => {
    const user = await client.getCurrentUser();

    expect(user.id).toBeGreaterThan(0);
    expect(user.login).toBe("mcp-test");
    expect(JSON.stringify(user)).not.toContain(
      readOnlyApiKey,
    );
  });

  it("returns a typed 401 error for an invalid API key", async () => {
    const invalidApiKey = "invalid-api-key";
    const invalidClient = new RedmineClient({
      baseUrl: redmineUrl,
      apiKey: invalidApiKey,
    });

    try {
      await invalidClient.getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);

      if (!(error instanceof RedmineHttpError)) {
        throw error;
      }

      expect(error.status).toBe(401);
      expect(error.method).toBe("GET");
      expect(error.path).toBe("/users/current.json");
      expect(error.message).not.toContain(
        invalidApiKey,
      );
    }
  });

  it("projects issue lists to bounded summaries with a default limit of 10", async () => {
    const response = await client.listIssues({
      projectId: PRIMARY_TEST_PROJECT_IDENTIFIER,
    });

    expect(response.limit).toBe(10);

    for (const item of response.items) {
      expect(item).not.toHaveProperty("description");
      expect(item).not.toHaveProperty("journals");
      expect(item).not.toHaveProperty("relations");
      expect(item).not.toHaveProperty("customFields");
      expect(item).not.toHaveProperty("author");
    }
  });

  it("keeps getIssue core-only unless optional associations are requested", async () => {
    const target = await findSeededIssue(
      client,
      AUTHENTICATION_FIXTURE_SUBJECT,
    );

    const issue = await client.getIssue(target.id);

    expect(issue).not.toHaveProperty("journals");
    expect(issue).not.toHaveProperty("relations");
    expect(issue).not.toHaveProperty("children");
    expect(issue).not.toHaveProperty("attachments");
    expect(issue).not.toHaveProperty(
      "allowedStatuses",
    );
  });

  it("retrieves requested issue journals, relations, attachments, and allowed statuses", async () => {
    const journalTarget = await findSeededIssue(
      client,
      JOURNAL_FIXTURE_SUBJECT,
    );

    const journalIssue = await client.getIssue(
      journalTarget.id,
      {
        include: [
          "journals",
          "attachments",
          "allowed_statuses",
        ],
      },
    );

    expect(
      journalIssue.journals?.some(
        ({ notes }) =>
          notes === "Initial investigation completed.",
      ),
    ).toBe(true);
    expect(journalIssue.attachments).toEqual([]);
    expect(
      Array.isArray(journalIssue.allowedStatuses),
    ).toBe(true);

    const relationTarget = await findSeededIssue(
      client,
      AUTHENTICATION_FIXTURE_SUBJECT,
    );

    const relationIssue = await client.getIssue(
      relationTarget.id,
      {
        include: ["relations"],
      },
    );

    expect(
      relationIssue.relations?.length,
    ).toBeGreaterThan(0);
  });

  it("supports substring matching for the issue subject filter", async () => {
    const response = await client.listIssues({
      projectId: PRIMARY_TEST_PROJECT_IDENTIFIER,
      subject: "invalid API",
      limit: 10,
    });

    expect(
      response.items.some(
        ({ subject }) =>
          subject === AUTHENTICATION_FIXTURE_SUBJECT,
      ),
    ).toBe(true);
  });

  it("projects project lists to bounded summaries", async () => {
    const response = await client.listProjects({
      limit: 20,
    });

    for (const item of response.items) {
      expect(item).not.toHaveProperty("description");
      expect(item).not.toHaveProperty("trackers");
      expect(item).not.toHaveProperty(
        "issueCategories",
      );
      expect(item).not.toHaveProperty(
        "issueCustomFields",
      );
    }
  });

  it("retrieves project versions, memberships, and issue priorities", async () => {
    const versions = await client.listProjectVersions(
      PRIMARY_TEST_PROJECT_IDENTIFIER,
    );
    const memberships =
      await client.listProjectMemberships(
        PRIMARY_TEST_PROJECT_IDENTIFIER,
        {
          limit: 100,
        },
      );
    const priorities =
      await client.listIssuePriorities();

    expect(Array.isArray(versions)).toBe(true);
    expect(Array.isArray(memberships.items)).toBe(
      true,
    );
    expect(priorities.length).toBeGreaterThan(0);

    expect(JSON.stringify(versions)).not.toContain(
      readOnlyApiKey,
    );
    expect(
      JSON.stringify(memberships),
    ).not.toContain(readOnlyApiKey);
    expect(JSON.stringify(priorities)).not.toContain(
      readOnlyApiKey,
    );
  });

  it("uses a default search limit of 10", async () => {
    const response = await client.search({
      query: "MCP",
    });

    expect(response.limit).toBe(10);
  });
});
