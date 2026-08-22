import { describe, expect, it } from "vitest";

import { callCurrentUserTool } from "../../src/mcp/tools/current-user.js";
import { RedmineHttpError } from "../../src/redmine/errors.js";
import type { RedmineUser } from "../../src/redmine/types.js";

const apiKey = "0123456789abcdef0123456789abcdef01234567";

describe("read-only tool foundation", () => {
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
    expect(content.text).not.toContain(apiKey);
  });

  it("uses the shared MCP error model for RedmineClient errors", async () => {
    const result = await callCurrentUserTool({
      getCurrentUser: () =>
        Promise.reject(
          new RedmineHttpError({
            method: "GET",
            path: "/users/current.json",
            status: 401,
            statusText: "Unauthorized",
            errors: [`invalid credential ${apiKey}`],
          }),
        ),
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const content = result.content[0];

    if (!content || content.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(content.text).toContain('"code":"authentication_failed"');
    expect(content.text).toContain(
      '"message":"Redmine authentication failed."',
    );
    expect(content.text).not.toContain(apiKey);
    expect(content.text).not.toContain("invalid credential");
  });
});
