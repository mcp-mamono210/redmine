import { describe, expect, it } from "vitest";

import { connectE2eClient, requireTextContent } from "./helpers.js";

describe("Search read-only MCP E2E", () => {
  it("uses a default limit of 10 and rejects limits above 20", async () => {
    const { client } = await connectE2eClient("redmine-mcp-search-e2e-client");

    try {
      const result = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
        },
      });

      expect(result.isError).not.toBe(true);

      const parsed = JSON.parse(requireTextContent(result.content)) as {
        items: Array<{ title: string; type: string }>;
        limit: number;
      };

      expect(parsed.limit).toBe(10);
      expect(
        parsed.items.some(
          ({ title, type }) =>
            type.startsWith("issue") &&
            title.includes("Authentication fails for invalid API token"),
        ),
      ).toBe(true);

      const invalidResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
          limit: 21,
        },
      });

      expect(invalidResult.isError).toBe(true);

      const invalidText = requireTextContent(invalidResult.content);

      expect(invalidText).toContain("Input validation error");
      expect(invalidText).toContain("expected number to be <=20");
    } finally {
      await client.close();
    }
  });
});
