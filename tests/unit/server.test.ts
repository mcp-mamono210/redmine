import { describe, expect, it } from "vitest";

import { createProductionServerDependencies } from "../../src/server.js";

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    REDMINE_URL: "https://redmine.example.test",
    REDMINE_API_KEY: "test-api-key",
  };
}

describe("production server composition", () => {
  it("defaults write access to disabled", () => {
    const { writeGuard } = createProductionServerDependencies(
      baseEnvironment(),
    );

    expect(writeGuard.canRegisterWriteTools()).toBe(false);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(false);
  });

  it("passes normalized allowed projects to the production Write Guard", () => {
    const { writeGuard } = createProductionServerDependencies({
      ...baseEnvironment(),
      REDMINE_WRITE_ENABLED: "true",
      REDMINE_ALLOWED_PROJECTS:
        " mcp-test, example-project, mcp-test, , ",
    });

    expect(writeGuard.canRegisterWriteTools()).toBe(true);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(true);
    expect(writeGuard.isProjectAllowed("example-project")).toBe(true);
    expect(writeGuard.isProjectAllowed("other-project")).toBe(false);
  });

  it("fails closed when write access is enabled without an allowlist", () => {
    const { writeGuard } = createProductionServerDependencies({
      ...baseEnvironment(),
      REDMINE_WRITE_ENABLED: "true",
      REDMINE_ALLOWED_PROJECTS: " , ",
    });

    expect(writeGuard.canRegisterWriteTools()).toBe(true);
    expect(writeGuard.isProjectAllowed("mcp-test")).toBe(false);
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
