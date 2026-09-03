import { describe, expect, it } from "vitest";

import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

interface CurrentUser {
  id: number;
  login: string;
  firstname?: string;
  lastname?: string;
  mail?: string;
}

describe("redmine_get_current_user MCP E2E", () => {
  it("lists and calls the tool over stdio against Docker Redmine", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-e2e-client",
    });

    try {
      const { tools } = await harness.listTools();
      const tool = tools.find(
        ({ name }) => name === "redmine_get_current_user",
      );

      expect(tool).toBeDefined();

      const result = await harness.callTool(
        "redmine_get_current_user",
      );

      expect(result.isError).not.toBe(true);

      const text = requireTextContent(result.content);
      const user = JSON.parse(text) as CurrentUser;

      expect(user.id).toBeGreaterThan(0);
      expect(user.login).toBe("mcp-test");
      expect(text).not.toContain(harness.redmineApiKey);
    } finally {
      await harness.close();
    }
  });
});
