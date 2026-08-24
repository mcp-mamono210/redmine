import { describe, expect, it } from "vitest";

import { connectE2eClient } from "./helpers.js";

const EXPECTED_READ_ONLY_TOOLS = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

describe("Read-only MCP Tool Annotations", () => {
  it("publishes bounded read-only annotations for every read-only tool", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-tool-annotations-e2e-client",
    );

    try {
      const { tools } = await client.listTools();
      const toolByName = new Map(
        tools.map((tool) => [tool.name, tool]),
      );

      for (const name of EXPECTED_READ_ONLY_TOOLS) {
        const tool = toolByName.get(name);

        expect(
          tool,
          `Missing read-only tool: ${name}`,
        ).toBeDefined();

        if (!tool) {
          throw new Error(`Missing read-only tool: ${name}`);
        }

        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          openWorldHint: false,
        });

        expect(tool.annotations).not.toHaveProperty(
          "destructiveHint",
        );
        expect(tool.annotations).not.toHaveProperty(
          "idempotentHint",
        );
      }
    } finally {
      await client.close();
    }
  });
});
