import { describe, expect, it } from "vitest";

import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

describe("MCP E2E harness", () => {
  it("manages the client lifecycle and exposes common tool operations", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-harness-e2e-client",
    });

    try {
      const { tools } = await harness.listTools();

      expect(tools.length).toBeGreaterThan(0);
      expect(
        await harness.hasTool("redmine_get_current_user"),
      ).toBe(true);

      const tool = await harness.getTool(
        "redmine_get_current_user",
      );

      expect(tool?.name).toBe("redmine_get_current_user");

      const result = await harness.callTool(
        "redmine_get_current_user",
      );

      expect(result.isError).not.toBe(true);

      const text = requireTextContent(result.content);
      const user = JSON.parse(text) as {
        id: number;
        login: string;
      };

      expect(user.id).toBeGreaterThan(0);
      expect(user.login).toBe("mcp-test");
      expect(text).not.toContain(harness.redmineApiKey);
    } finally {
      await harness.close();
    }

    await expect(harness.close()).resolves.toBeUndefined();
  });

  it("passes server environment overrides without mutating the test process", async () => {
    const variableName = "MCP_E2E_HARNESS_PROBE";
    const previousValue = process.env[variableName];

    delete process.env[variableName];

    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-harness-env-e2e-client",
      env: {
        [variableName]: "child-only",
      },
    });

    try {
      expect(process.env[variableName]).toBeUndefined();

      const { tools } = await harness.listTools();
      expect(tools.length).toBeGreaterThan(0);
    } finally {
      await harness.close();

      if (previousValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = previousValue;
      }
    }
  });
});
