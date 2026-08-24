import { describe, expect, it } from "vitest";

import { callCurrentUserTool } from "../../src/mcp/tools/current-user.js";
import type { RedmineUser } from "../../src/redmine/types.js";

function requireText(result: {
  content: Array<{ type: "text"; text: string }>;
}): string {
  const content = result.content[0];

  if (!content || content.type !== "text") {
    throw new Error("Expected text content");
  }

  return content.text;
}

function requireStructuredContent(result: {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
}): Record<string, unknown> {
  if (!result.structuredContent) {
    throw new Error("Expected structuredContent");
  }

  return result.structuredContent;
}

describe("Current user tool", () => {
  it("returns matching JSON text and structured output", async () => {
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

    const text = requireText(result);
    const structured = requireStructuredContent(result);

    expect(JSON.parse(text) as unknown).toEqual(user);
    expect(structured).toEqual(user);
    expect(structured).toEqual(JSON.parse(text) as unknown);
  });
});
