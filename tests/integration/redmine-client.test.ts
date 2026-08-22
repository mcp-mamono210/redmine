import { describe, expect, it } from "vitest";

import { createRedmineClientFromEnv } from "../../src/redmine/client.js";

interface CurrentUserResponse {
  user?: {
    login?: string;
  };
}

describe("RedmineClient integration", () => {
  it("retrieves the current seeded Redmine user", async () => {
    const client = createRedmineClientFromEnv();
    const response = (await client.getCurrentUser()) as CurrentUserResponse;

    expect(response.user?.login).toBe("mcp-test");
  });
});
