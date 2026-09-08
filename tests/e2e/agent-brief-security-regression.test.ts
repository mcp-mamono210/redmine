import { describe, expect, it } from "vitest";

import { createMcpE2eHarness } from "./helpers.js";

describe("Phase 42-1 Agent Brief security publication boundary", () => {
  it("keeps Agent Brief approval unpublished when write access is disabled", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-agent-brief-security-e2e-client",
      env: {
        REDMINE_WRITE_ENABLED: "false",
        REDMINE_ALLOWED_PROJECTS: undefined,
        AGENT_BRIEF_REPOSITORY_ROOT: undefined,
        AGENT_BRIEF_REPOSITORY: undefined,
      },
    });

    try {
      expect(
        await harness.hasTool("redmine_approve_agent_brief"),
      ).toBe(false);

      const listed = await harness.listTools();
      const serialized = JSON.stringify(listed);

      expect(serialized).not.toContain(harness.redmineApiKey);
    } finally {
      await harness.close();
    }
  });
});
