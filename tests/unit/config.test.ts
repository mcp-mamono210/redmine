import { describe, expect, it } from "vitest";

import { loadWriteGuardConfig } from "../../src/config.js";

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
