import { describe, expect, it } from "vitest";

import { createMcpE2eHarness } from "./helpers.js";

const EXPECTED_READ_ONLY_TOOL_NAMES = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

async function expectReadOnlyToolSurface(
  writeEnabled: string | undefined,
): Promise<void> {
  const harness = await createMcpE2eHarness({
    clientName: `redmine-mcp-write-guard-${writeEnabled ?? "unset"}`,
    env: {
      REDMINE_WRITE_ENABLED: writeEnabled,
      REDMINE_ALLOWED_PROJECTS: "mcp-test",
    },
  });

  try {
    const { tools } = await harness.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...EXPECTED_READ_ONLY_TOOL_NAMES].sort(),
    );
  } finally {
    await harness.close();
  }
}

describe("production Write Guard startup", () => {
  it("starts write-disabled by default and keeps the six-tool contract", async () => {
    await expectReadOnlyToolSurface(undefined);
  });

  it("starts with REDMINE_WRITE_ENABLED=false and keeps the six-tool contract", async () => {
    await expectReadOnlyToolSurface("false");
  });

  it("does not publish unimplemented write tools when write access is enabled", async () => {
    await expectReadOnlyToolSurface("true");
  });

  it("rejects invalid REDMINE_WRITE_ENABLED before exposing tools", async () => {
    const secretAllowlistValue = "internal-project-that-must-not-leak";

    let startupError: unknown;

    try {
      const harness = await createMcpE2eHarness({
        clientName: "redmine-mcp-write-guard-invalid-config",
        env: {
          REDMINE_WRITE_ENABLED: "yes",
          REDMINE_ALLOWED_PROJECTS: secretAllowlistValue,
        },
      });

      await harness.close();
    } catch (error) {
      startupError = error;
    }

    expect(startupError).toBeDefined();

    const message =
      startupError instanceof Error
        ? startupError.message
        : String(startupError);
    const redmineApiKey = process.env.REDMINE_API_KEY;

    expect(message).not.toContain(secretAllowlistValue);

    if (redmineApiKey) {
      expect(message).not.toContain(redmineApiKey);
    }
  });
});
