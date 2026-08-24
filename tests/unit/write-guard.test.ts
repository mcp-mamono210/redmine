import { describe, expect, it } from "vitest";

import {
  WriteGuard,
  WriteGuardError,
} from "../../src/mcp/write-guard.js";

describe("WriteGuard", () => {
  it("does not allow write Tool registration when write access is disabled", () => {
    const guard = new WriteGuard({
      writeEnabled: false,
      allowedProjects: ["mcp-test"],
    });

    expect(guard.canRegisterWriteTools()).toBe(false);
    expect(guard.isProjectAllowed("mcp-test")).toBe(false);
  });

  it("allows write Tool registration only when write access is enabled", () => {
    const guard = new WriteGuard({
      writeEnabled: true,
      allowedProjects: [],
    });

    expect(guard.canRegisterWriteTools()).toBe(true);
  });

  it("allows only configured project identifiers", () => {
    const guard = new WriteGuard({
      writeEnabled: true,
      allowedProjects: [
        "mcp-test",
        "example-project",
      ],
    });

    expect(guard.isProjectAllowed("mcp-test")).toBe(true);
    expect(
      guard.isProjectAllowed(" example-project "),
    ).toBe(true);
    expect(
      guard.isProjectAllowed("mcp-secondary"),
    ).toBe(false);
    expect(guard.isProjectAllowed("")).toBe(false);
  });

  it("fails closed when write access is enabled without allowed projects", () => {
    const guard = new WriteGuard({
      writeEnabled: true,
      allowedProjects: [],
    });

    expect(guard.isProjectAllowed("mcp-test")).toBe(false);
    expect(() =>
      guard.assertProjectAllowed("mcp-test"),
    ).toThrowError(
      "Write operation is not allowed for this project",
    );
  });

  it("rejects project checks when write access is disabled", () => {
    const guard = new WriteGuard({
      writeEnabled: false,
      allowedProjects: ["mcp-test"],
    });

    expect(() =>
      guard.assertProjectAllowed("mcp-test"),
    ).toThrowError(WriteGuardError);
    expect(() =>
      guard.assertProjectAllowed("mcp-test"),
    ).toThrowError("Write operations are disabled");
  });

  it("does not expose allowlist contents in rejection errors", () => {
    const guard = new WriteGuard({
      writeEnabled: true,
      allowedProjects: ["mcp-test"],
    });

    try {
      guard.assertProjectAllowed("mcp-secondary");
      throw new Error("Expected project guard to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(WriteGuardError);

      if (!(error instanceof WriteGuardError)) {
        throw error;
      }

      expect(error.message).toBe(
        "Write operation is not allowed for this project",
      );
      expect(error.message).not.toContain("mcp-test");
      expect(error.message).not.toContain("mcp-secondary");
    }
  });
});
