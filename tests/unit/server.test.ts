import { describe, expect, it } from "vitest";

import { createProductionServerDependencies } from "../../src/server.js";

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    REDMINE_URL: "https://redmine.example.test",
    REDMINE_API_KEY: "test-api-key",
    AGENT_BRIEF_REPOSITORY_ROOT: "/tmp/redmine-agent-brief-test",
    AGENT_BRIEF_REPOSITORY: "mcp-mamono210/redmine",
  };
}

describe("production server composition", () => {
  it("defaults write access to disabled without requiring approval storage", () => {
    const {
      writeGuard,
      agentBriefApprovalHandler,
    } = createProductionServerDependencies({
      REDMINE_URL: "https://redmine.example.test",
      REDMINE_API_KEY: "test-api-key",
    });

    expect(writeGuard.canRegisterWriteTools()).toBe(false);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(false);
    expect(agentBriefApprovalHandler).toBeUndefined();
  });

  it("passes normalized allowed projects to the production Write Guard and composes approval", () => {
    const {
      writeGuard,
      agentBriefApprovalHandler,
    } = createProductionServerDependencies({
      ...baseEnvironment(),
      REDMINE_WRITE_ENABLED: "true",
      REDMINE_ALLOWED_PROJECTS:
        " mcp-test, example-project, mcp-test, , ",
    });

    expect(writeGuard.canRegisterWriteTools()).toBe(true);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(true);
    expect(writeGuard.isProjectAllowed("example-project")).toBe(true);
    expect(writeGuard.isProjectAllowed("other-project")).toBe(false);
    expect(agentBriefApprovalHandler).toBeDefined();
  });

  it("fails closed when write access is enabled without an allowlist", () => {
    const {
      writeGuard,
      agentBriefApprovalHandler,
    } = createProductionServerDependencies({
      ...baseEnvironment(),
      REDMINE_WRITE_ENABLED: "true",
      REDMINE_ALLOWED_PROJECTS: " , ",
    });

    expect(writeGuard.canRegisterWriteTools()).toBe(true);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(false);
    expect(agentBriefApprovalHandler).toBeDefined();
  });

  it("requires the Phase 37 approval storage boundary before publishing writes", () => {
    expect(() =>
      createProductionServerDependencies({
        REDMINE_URL: "https://redmine.example.test",
        REDMINE_API_KEY: "test-api-key",
        REDMINE_WRITE_ENABLED: "true",
        REDMINE_ALLOWED_PROJECTS: "mcp-test",
      }),
    ).toThrowError(
      "AGENT_BRIEF_REPOSITORY_ROOT is required when write tools are enabled",
    );
  });

  it("rejects invalid write configuration before constructing the server", () => {
    expect(() =>
      createProductionServerDependencies({
        REDMINE_WRITE_ENABLED: "yes",
      }),
    ).toThrowError(
      'REDMINE_WRITE_ENABLED must be either "true" or "false"',
    );
  });
});
