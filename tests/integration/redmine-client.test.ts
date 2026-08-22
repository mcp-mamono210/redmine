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

  it("retrieves the representative project with metadata", async () => {
    const project = await client.getProject("mcp-test", {
      include: ["trackers", "issue_custom_fields"],
    });

    expect(project.name).toBe("MCP Test Project");
    expect(project.identifier).toBe("mcp-test");
  });

  it("searches globally", async () => {
    const response = await client.search({
      query: "Secondary project search target",
      limit: 20,
    });

    expect(
      response.items.some((result) =>
        result.title.includes("Secondary project search target"),
      ),
    ).toBe(true);

    for (const result of response.items) {
      expect(result.url).not.toContain(redmineApiKey);
    }
  });

  it("restricts search to the primary project", async () => {
    const response = await client.search({
      query: "Secondary project search target",
      projectId: "mcp-test",
      limit: 20,
    });

    expect(
      response.items.some((result) =>
        result.title.includes("Secondary project search target"),
      ),
    ).toBe(false);
  });

  it("finds the target in the secondary project", async () => {
    const response = await client.search({
      query: "Secondary project search target",
      projectId: "mcp-secondary",
      limit: 20,
    });

    expect(
      response.items.some((result) =>
        result.title.includes("Secondary project search target"),
      ),
    ).toBe(true);
  });

  it("searches representative issue subjects", async () => {
    const response = await client.search({
      query: "Add issue listing support",
      projectId: "mcp-test",
      limit: 20,
    });

    expect(
      response.items.some((result) =>
        result.title.includes("Add issue listing support"),
      ),
    ).toBe(true);
    expect(response.items.every((result) => result.type.length > 0)).toBe(true);
  });

  it("searches representative issue descriptions", async () => {
    const response = await client.search({
      query: "verify Redmine MCP search behavior",
      projectId: "mcp-test",
      limit: 20,
    });

    expect(response.items.length).toBeGreaterThan(0);
  });

  it("supports search pagination", async () => {
    const response = await client.search({
      query: "MCP",
      offset: 0,
      limit: 1,
    });

    expect(response.items.length).toBeLessThanOrEqual(1);
    expect(response.offset).toBe(0);
    expect(response.limit).toBe(1);
    expect(response.totalCount).toBeGreaterThanOrEqual(response.items.length);
  });

  it("rejects an empty search query", async () => {
    await expect(
      client.search({
        query: "   ",
      }),
    ).rejects.toThrow("Search query must not be empty");
  });

  it("returns a typed 404 error for a missing project-scoped search", async () => {
    await expect(
      client.search({
        query: "MCP",
        projectId: "project-that-does-not-exist",
      }),
    ).rejects.toMatchObject({
      name: "RedmineHttpError",
      status: 404,
    });

    try {
      await client.search({
        query: "MCP",
        projectId: "project-that-does-not-exist",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);
      expect(String(error)).not.toContain(redmineApiKey);
    }
  });
});
