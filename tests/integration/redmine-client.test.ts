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

  it("retrieves the current seeded Redmine user without exposing the API key", async () => {
    const user = await client.getCurrentUser();

    expect(user.id).toBeGreaterThan(0);
    expect(user.login).toBe("mcp-test");
    expect(JSON.stringify(user)).not.toContain(redmineApiKey);
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
      expect(error.message).not.toContain(invalidApiKey);
    }
  });

  it("projects issue lists to bounded summaries with a default limit of 10", async () => {
    const response = await client.listIssues({
      projectId: "mcp-test",
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

  it("supports substring matching for the issue subject filter", async () => {
    const response = await client.listIssues({
      projectId: "mcp-test",
      subject: "invalid API",
      limit: 10,
    });

    expect(
      response.items.some(
        ({ subject }) => subject === "Authentication fails for invalid API token",
      ),
    ).toBe(true);
  });

  it("projects project lists to bounded summaries", async () => {
    const response = await client.listProjects({ limit: 20 });

    for (const item of response.items) {
      expect(item).not.toHaveProperty("description");
      expect(item).not.toHaveProperty("trackers");
      expect(item).not.toHaveProperty("issueCategories");
      expect(item).not.toHaveProperty("issueCustomFields");
    }
  });

  it("uses a default search limit of 10", async () => {
    const response = await client.search({
      query: "MCP",
    });

    expect(response.limit).toBe(10);
  });
});
