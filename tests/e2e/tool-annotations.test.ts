import { describe, expect, it } from "vitest";

import { toolRegistry } from "../../src/mcp/tool-registry.js";
import { createMcpE2eHarness } from "./helpers.js";

describe("MCP Tool Registry invariants", () => {
  it("publishes exactly the registry read tools with read-only annotations", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-tool-annotations-e2e-client",
      env: {
        REDMINE_WRITE_ENABLED: "false",
      },
    });

    try {
      const { tools } = await harness.listTools();
      const expectedReadTools = toolRegistry.filter(
        (entry) => entry.access === "read",
      );
      const expectedReadToolNames = expectedReadTools
        .map((entry) => entry.name)
        .sort();
      const actualToolNames = tools
        .map((tool) => tool.name)
        .sort();

      expect(actualToolNames).toEqual(expectedReadToolNames);

      const toolByName = new Map(
        tools.map((tool) => [tool.name, tool]),
      );

      for (const entry of expectedReadTools) {
        const tool = toolByName.get(entry.name);

        expect(
          tool,
          `Missing registry read tool: ${entry.name}`,
        ).toBeDefined();

        if (!tool) {
          throw new Error(
            `Missing registry read tool: ${entry.name}`,
          );
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
      await harness.close();
    }
  });
});
