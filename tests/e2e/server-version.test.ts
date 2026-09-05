import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createMcpE2eHarness } from "./helpers.js";

const EXPECTED_SERVER_NAME = "redmine-mcp-server";
const EXPECTED_READ_ONLY_TOOL_NAMES = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  ) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json must define a non-empty version");
  }

  return packageJson.version;
}

describe("MCP server version metadata", () => {
  it("reports the package version through the production initialize path", async () => {
    const packageVersion = readPackageVersion();

    expect(packageVersion).toBe("0.2.0");

    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-server-version-e2e-client",
    });

    try {
      expect(harness.getServerVersion()).toMatchObject({
        name: EXPECTED_SERVER_NAME,
        version: packageVersion,
      });

      const { tools } = await harness.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [...EXPECTED_READ_ONLY_TOOL_NAMES].sort(),
      );
    } finally {
      await harness.close();
    }
  });
});
