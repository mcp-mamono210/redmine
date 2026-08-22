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

  it("returns a typed 404 error for a missing issue", async () => {
    try {
      await client.getIssue(999_999_999);
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);

      if (!(error instanceof RedmineHttpError)) {
        throw error;
      }

      expect(error.status).toBe(404);
      expect(error.path).toBe("/issues/999999999.json");
      expect(error.message).not.toContain(redmineApiKey);
    }
  });

  it("keeps API keys out of search result URLs", async () => {
    const response = await client.search({
      query: "MCP",
      limit: 20,
    });

    for (const result of response.items) {
      expect(result.url).not.toContain(redmineApiKey);
    }
  });
});
