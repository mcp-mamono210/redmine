import { describe, expect, it } from "vitest";

import { connectE2eClient, requireTextContent } from "./helpers.js";

describe("Project read-only MCP E2E", () => {
  it("keeps list_projects summarized while get_project remains detailed", async () => {
    const { client } = await connectE2eClient("redmine-mcp-projects-e2e-client");

    try {
      const listResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: { limit: 20 },
      });

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(requireTextContent(listResult.content)) as {
        items: Array<
          Record<string, unknown> & {
            id: number;
            identifier: string;
          }
        >;
      };

      const target = list.items.find(({ identifier }) => identifier === "mcp-test");
      expect(target).toBeDefined();

      for (const item of list.items) {
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("trackers");
        expect(item).not.toHaveProperty("issueCategories");
        expect(item).not.toHaveProperty("issueCustomFields");
      }

      if (!target) {
        throw new Error("MCP Test Project was not found");
      }

      const getResult = await client.callTool({
        name: "redmine_get_project",
        arguments: { project_id: target.identifier },
      });

      expect(getResult.isError).not.toBe(true);

      const detail = JSON.parse(requireTextContent(getResult.content)) as Record<
        string,
        unknown
      >;

      expect(detail).toHaveProperty("trackers");
      expect(detail).toHaveProperty("issueCategories");
      expect(detail).toHaveProperty("issueCustomFields");
    } finally {
      await client.close();
    }
  });
});
