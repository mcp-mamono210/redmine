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
    expect(response.items.map((issue) => issue.subject)).toContain(
      "Add issue listing support",
    );
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
    expect(issue.journals?.length).toBeGreaterThan(0);
    expect(issue.relations?.length).toBeGreaterThan(0);
    expect(issue.allowedStatuses).toBeDefined();
  });

  it("retrieves the representative project with metadata", async () => {
    const project = await client.getProject("mcp-test", {
      include: ["trackers", "issue_custom_fields"],
    });

    expect(project.name).toBe("MCP Test Project");
    expect(project.identifier).toBe("mcp-test");
    expect(project.trackers?.map((tracker) => tracker.name)).toEqual(
      expect.arrayContaining(["Bug", "Feature", "Task"]),
    );
    expect(
      project.issueCustomFields?.some((field) => field.name === "release_tag"),
    ).toBe(true);
  });

  it("lists representative projects", async () => {
    const response = await client.listProjects({ limit: 100 });
    const identifiers = response.items.map((project) => project.identifier);

    expect(identifiers).toContain("mcp-test");
    expect(identifiers).toContain("mcp-secondary");
  });

  it("supports project pagination", async () => {
    const response = await client.listProjects({
      offset: 0,
      limit: 1,
    });

    expect(response.items.length).toBeLessThanOrEqual(1);
    expect(response.offset).toBe(0);
    expect(response.limit).toBe(1);
    expect(response.totalCount).toBeGreaterThanOrEqual(2);
  });

  it("lists project versions", async () => {
    const versions = await client.listProjectVersions("mcp-test");
    const names = versions.map((version) => version.name);

    expect(names).toContain("v0.1.0");
    expect(names).toContain("v0.2.0");
  });

  it("lists project memberships", async () => {
    const response = await client.listProjectMemberships("mcp-test", {
      limit: 100,
    });

    const membership = response.items.find(
      (item) => item.user?.name === "MCP Test",
    );

    expect(membership).toBeDefined();
    expect(membership?.roles.map((role) => role.name)).toContain(
      "MCP Read Only",
    );
  });

  it("returns a typed 404 error for a missing project", async () => {
    await expect(
      client.getProject("project-that-does-not-exist"),
    ).rejects.toMatchObject({
      name: "RedmineHttpError",
      status: 404,
    });

    try {
      await client.getProject("project-that-does-not-exist");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);
      expect(String(error)).not.toContain(redmineApiKey);
    }
  });
});
