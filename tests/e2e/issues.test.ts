import { describe, expect, it } from "vitest";

import { connectE2eClient, requireTextContent } from "./helpers.js";

describe("Issue read-only MCP E2E", () => {
  it("returns bounded issue summaries and preserves detailed get_issue responses", async () => {
    const { client } = await connectE2eClient("redmine-mcp-issues-e2e-client");

    try {
      const listResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: "invalid API",
        },
      });

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(requireTextContent(listResult.content)) as {
        items: Array<Record<string, unknown> & { id: number; subject: string }>;
        limit: number;
      };

      expect(list.limit).toBe(10);
      expect(list.items.length).toBeGreaterThan(0);

      const target = list.items.find(
        ({ subject }) => subject === "Authentication fails for invalid API token",
      );

      expect(target).toBeDefined();

      for (const item of list.items) {
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("journals");
        expect(item).not.toHaveProperty("relations");
        expect(item).not.toHaveProperty("customFields");
        expect(item).not.toHaveProperty("author");
      }

      if (!target) {
        throw new Error("Representative issue was not found");
      }

      const getResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: { issue_id: target.id },
      });

      expect(getResult.isError).not.toBe(true);

      const detail = JSON.parse(requireTextContent(getResult.content)) as Record<
        string,
        unknown
      >;

      expect(detail).toHaveProperty("description");
      expect(detail).toHaveProperty("journals");
      expect(detail).toHaveProperty("relations");
    } finally {
      await client.close();
    }
  });

  it("rejects list limits above 20 at the MCP schema boundary", async () => {
    const { client } = await connectE2eClient("redmine-mcp-issues-limit-e2e-client");

    try {
      const invalidResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
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
