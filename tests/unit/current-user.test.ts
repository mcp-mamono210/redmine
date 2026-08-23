import { describe, expect, it } from "vitest";

import { callCurrentUserTool } from "../../src/mcp/tools/current-user.js";
import type { RedmineUser } from "../../src/redmine/types.js";

describe("Current user tool", () => {
  it("returns the current user as JSON text", async () => {
    const user: RedmineUser = {
      id: 7,
      login: "mcp-test",
      firstname: "MCP",
      lastname: "Test",
      mail: "mcp-test@example.test",
    };

    const result = await callCurrentUserTool({
      getCurrentUser: () => Promise.resolve(user),
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);

    const content = result.content[0];

    if (!content || content.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(JSON.parse(content.text) as unknown).toEqual(user);
  });
});
