import { describe, expect, it } from "vitest";

import {
  loadAgentBriefApprovalConfig,
  loadWriteGuardConfig,
} from "../../src/config.js";

describe("loadWriteGuardConfig", () => {
  it("defaults write access to disabled with an empty allowlist", () => {
    const config = loadWriteGuardConfig({});

    expect(config).toEqual({
      writeEnabled: false,
      allowedProjects: [],
    });
  });

  it.each([
    ["true", true],
    ["false", false],
    [" true ", true],
    [" false ", false],
  ] as const)(
    "parses REDMINE_WRITE_ENABLED=%s",
    (value, expected) => {
      const config = loadWriteGuardConfig({
        REDMINE_WRITE_ENABLED: value,
      });

      expect(config.writeEnabled).toBe(expected);
    },
  );

  it.each(["", "1", "yes", "TRUE", "False"])(
    "rejects invalid REDMINE_WRITE_ENABLED=%s",
    (value) => {
      expect(() =>
        loadWriteGuardConfig({
          REDMINE_WRITE_ENABLED: value,
        }),
      ).toThrowError(
        'REDMINE_WRITE_ENABLED must be either "true" or "false"',
      );
    },
  );

  it("normalizes, filters, and deduplicates allowed projects", () => {
    const config = loadWriteGuardConfig({
      REDMINE_ALLOWED_PROJECTS:
        "mcp-test, example-project, mcp-test, ,",
    });

    expect(config.allowedProjects).toEqual([
      "mcp-test",
      "example-project",
    ]);
  });

  it("treats an empty allowed-project value as an empty allowlist", () => {
    const config = loadWriteGuardConfig({
      REDMINE_WRITE_ENABLED: "true",
      REDMINE_ALLOWED_PROJECTS: " , ",
    });

    expect(config).toEqual({
      writeEnabled: true,
      allowedProjects: [],
    });
  });
});

describe("loadAgentBriefApprovalConfig", () => {
  it("loads the Phase 37 persistence boundary and defaults the canonical branch", () => {
    const config = loadAgentBriefApprovalConfig({
      AGENT_BRIEF_REPOSITORY_ROOT: " /srv/repos/redmine ",
      AGENT_BRIEF_REPOSITORY: " mcp-mamono210/redmine ",
    });

    expect(config).toEqual({
      repositoryRoot: "/srv/repos/redmine",
      repository: "mcp-mamono210/redmine",
      canonicalBranch: "main",
      requirementCustomFieldIds: [],
    });
  });

  it("normalizes requirement custom-field IDs deterministically", () => {
    const config = loadAgentBriefApprovalConfig({
      AGENT_BRIEF_REPOSITORY_ROOT: "/srv/repos/redmine",
      AGENT_BRIEF_REPOSITORY: "mcp-mamono210/redmine",
      AGENT_BRIEF_CANONICAL_BRANCH: " agent-brief-main ",
      AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS:
        "21, 7,21, 9",
    });

    expect(config.canonicalBranch).toBe("agent-brief-main");
    expect(config.requirementCustomFieldIds).toEqual([7, 9, 21]);
  });

  it.each([
    ["AGENT_BRIEF_REPOSITORY_ROOT", undefined],
    ["AGENT_BRIEF_REPOSITORY_ROOT", "   "],
    ["AGENT_BRIEF_REPOSITORY", undefined],
    ["AGENT_BRIEF_REPOSITORY", ""],
  ] as const)(
    "requires %s for approval composition",
    (missingName, missingValue) => {
      const env: Record<string, string | undefined> = {
        AGENT_BRIEF_REPOSITORY_ROOT: "/srv/repos/redmine",
        AGENT_BRIEF_REPOSITORY: "mcp-mamono210/redmine",
      };
      env[missingName] = missingValue;

      expect(() =>
        loadAgentBriefApprovalConfig(env),
      ).toThrowError(
        `${missingName} is required when write tools are enabled`,
      );
    },
  );

  it.each(["abc", "0", "-1", "1.5", "9007199254740992"])(
    "rejects invalid requirement custom-field ID %s",
    (value) => {
      expect(() =>
        loadAgentBriefApprovalConfig({
          AGENT_BRIEF_REPOSITORY_ROOT: "/srv/repos/redmine",
          AGENT_BRIEF_REPOSITORY: "mcp-mamono210/redmine",
          AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS: value,
        }),
      ).toThrowError(
        "AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS must contain only positive safe integers",
      );
    },
  );
});
