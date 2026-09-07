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

const AGENT_BRIEF_APPROVAL_TOOL_NAME =
  "redmine_approve_agent_brief";

function approvalConfiguration(): Record<string, string> {
  return {
    AGENT_BRIEF_REPOSITORY_ROOT: process.cwd(),
    AGENT_BRIEF_REPOSITORY: "mcp-mamono210/redmine",
    AGENT_BRIEF_CANONICAL_BRANCH: "main",
    AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS: "",
  };
}

async function listToolNames(
  writeEnabled: string | undefined,
  extraEnv: Record<string, string | undefined> = {},
): Promise<string[]> {
  const harness = await createMcpE2eHarness({
    clientName: `redmine-mcp-write-guard-${writeEnabled ?? "unset"}`,
    env: {
      REDMINE_WRITE_ENABLED: writeEnabled,
      REDMINE_ALLOWED_PROJECTS: "mcp-test",
      ...extraEnv,
    },
  });

  try {
    const { tools } = await harness.listTools();
    return tools.map((tool) => tool.name).sort();
  } finally {
    await harness.close();
  }
}

async function expectReadOnlyToolSurface(
  writeEnabled: string | undefined,
): Promise<void> {
  expect(await listToolNames(writeEnabled)).toEqual(
    [...EXPECTED_READ_ONLY_TOOL_NAMES].sort(),
  );
}

describe("production Write Guard startup", () => {
  it("starts write-disabled by default and keeps the six-tool contract", async () => {
    await expectReadOnlyToolSurface(undefined);
  });

  it("starts with REDMINE_WRITE_ENABLED=false and keeps the six-tool contract", async () => {
    await expectReadOnlyToolSurface("false");
  });

  it("fails closed when write access is enabled without approval persistence configuration", async () => {
    let startupError: unknown;

    try {
      const harness = await createMcpE2eHarness({
        clientName: "redmine-mcp-write-guard-missing-approval-config",
        env: {
          REDMINE_WRITE_ENABLED: "true",
          REDMINE_ALLOWED_PROJECTS: "mcp-test",
          AGENT_BRIEF_REPOSITORY_ROOT: undefined,
          AGENT_BRIEF_REPOSITORY: undefined,
        },
      });

      await harness.close();
    } catch (error) {
      startupError = error;
    }

    expect(startupError).toBeDefined();
  });

  it("publishes exactly one configured Agent Brief approval write Tool", async () => {
    const names = await listToolNames(
      "true",
      approvalConfiguration(),
    );

    expect(names).toEqual(
      [
        ...EXPECTED_READ_ONLY_TOOL_NAMES,
        AGENT_BRIEF_APPROVAL_TOOL_NAME,
      ].sort(),
    );
  });

  it("rejects invalid REDMINE_WRITE_ENABLED before exposing tools", async () => {
    const secretAllowlistValue =
      "internal-project-that-must-not-leak";

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
