import { beforeAll, describe, expect, it } from "vitest";

import {
  RedmineClient,
  createRedmineClientFromEnv,
} from "../../src/redmine/client.js";
import { RedmineHttpError } from "../../src/redmine/errors.js";

const redmineUrl = process.env.REDMINE_URL;
const redmineApiKey = process.env.REDMINE_API_KEY;

if (!redmineUrl || !redmineApiKey) {
  throw new Error(
    "REDMINE_URL and REDMINE_API_KEY are required for integration tests",
  );
}

describe("RedmineClient integration", () => {
  let client: RedmineClient;

  beforeAll(() => {
    client = createRedmineClientFromEnv();
  });

  it("retrieves the current seeded Redmine user", async () => {
    const user = await client.getCurrentUser();

    expect(user.id).toBeGreaterThan(0);
    expect(user.login).toBe("mcp-test");
  });

  it("lists representative issues with pagination metadata", async () => {
    const response = await client.listIssues({
      projectId: "mcp-test",
      statusId: "*",
      limit: 20,
    });

    expect(response.totalCount).toBeGreaterThanOrEqual(4);
    expect(response.offset).toBeGreaterThanOrEqual(0);
    expect(response.limit).toBeGreaterThan(0);

    const subjects = response.items.map((issue) => issue.subject);

    expect(subjects).toContain("Authentication fails for invalid API token");
    expect(subjects).toContain("Add issue listing support");
    expect(subjects).toContain("Prepare representative Redmine test data");
    expect(subjects).toContain("Complete walking skeleton");
    expect(subjects).not.toContain("Secondary project search target");
  });

  it("retrieves an issue with journals, relations, and allowed statuses", async () => {
    const issues = await client.listIssues({
      projectId: "mcp-test",
      statusId: "*",
      limit: 20,
    });

    const target = issues.items.find(
      (issue) => issue.subject === "Add issue listing support",
    );

    expect(target).toBeDefined();

    if (!target) {
      throw new Error("Representative issue was not found");
    }

    const issue = await client.getIssue(target.id, {
      include: ["journals", "relations", "allowed_statuses"],
    });

    expect(issue.project.name).toBe("MCP Test Project");
    expect(issue.tracker.name).toBe("Feature");
    expect(issue.status.name).toBe("In Progress");
    expect(issue.priority.name).toBe("Normal");

    const releaseTag = issue.customFields.find(
      (field) => field.name === "release_tag",
    );

    expect(releaseTag?.value).toBe("v0.1.0");

    expect(
      issue.journals?.some(
        (journal) => journal.notes === "Initial investigation completed.",
      ),
    ).toBe(true);

    expect(issue.relations?.length).toBeGreaterThan(0);
    expect(issue.allowedStatuses).toBeDefined();
  });

  it("supports pagination", async () => {
    const response = await client.listIssues({
      projectId: "mcp-test",
      statusId: "*",
      limit: 2,
      offset: 0,
    });

    expect(response.items.length).toBeLessThanOrEqual(2);
    expect(response.limit).toBe(2);
    expect(response.offset).toBe(0);
    expect(response.totalCount).toBeGreaterThanOrEqual(4);
  });

  it("filters issues by assignee", async () => {
    const allIssues = await client.listIssues({
      projectId: "mcp-test",
      statusId: "*",
      limit: 20,
    });

    const assigned = allIssues.items.find(
      (issue) =>
        issue.subject === "Add issue listing support" && issue.assignedTo,
    );

    expect(assigned?.assignedTo).toBeDefined();

    if (!assigned?.assignedTo) {
      throw new Error("Representative assigned issue was not found");
    }

    const filtered = await client.listIssues({
      projectId: "mcp-test",
      statusId: "*",
      assignedToId: assigned.assignedTo.id,
      limit: 20,
    });

    expect(filtered.items.length).toBeGreaterThan(0);
    expect(
      filtered.items.every(
        (issue) => issue.assignedTo?.id === assigned.assignedTo?.id,
      ),
    ).toBe(true);
  });

  it("returns a typed 404 error for a missing issue", async () => {
    await expect(client.getIssue(999_999_999)).rejects.toMatchObject({
      name: "RedmineHttpError",
      status: 404,
    });

    try {
      await client.getIssue(999_999_999);
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);
      expect(String(error)).not.toContain(redmineApiKey);
    }
  });
});
