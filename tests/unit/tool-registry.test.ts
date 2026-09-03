import { describe, expect, it, vi } from "vitest";

import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../../src/redmine/client.js";
import {
  assertUniqueToolNames,
  getPublishedToolRegistry,
  toolRegistry,
  type ToolRegistryEntry,
} from "../../src/mcp/tool-registry.js";

describe("MCP tool registry", () => {
  it("registers every tool name exactly once", () => {
    expect(toolRegistry.length).toBeGreaterThan(0);
    expect(() => assertUniqueToolNames()).not.toThrow();

    const names = toolRegistry.map((entry) => entry.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(toolRegistry)(
    "defines complete metadata for $name",
    (entry) => {
      expect(entry.name).toMatch(/^redmine_[a-z0-9_]+$/);
      expect(["read", "write"]).toContain(entry.access);
      expect(entry.register).toBeTypeOf("function");
    },
  );

  it("classifies every currently implemented tool as read-only", () => {
    expect(
      toolRegistry.every((entry) => entry.access === "read"),
    ).toBe(true);
  });

  it("rejects duplicate tool names", () => {
    const register = vi.fn();

    const duplicateRegistry = [
      {
        name: "redmine_duplicate",
        access: "read",
        register,
      },
      {
        name: "redmine_duplicate",
        access: "write",
        register,
      },
    ] satisfies readonly ToolRegistryEntry[];

    expect(() =>
      assertUniqueToolNames(duplicateRegistry),
    ).toThrowError(
      "Duplicate MCP tool name in registry: redmine_duplicate",
    );
  });

  it("filters write tools when write publication is disabled", () => {
    const readRegister = vi.fn(
      (_server: McpServer, _client: RedmineClient) => {},
    );
    const writeRegister = vi.fn(
      (_server: McpServer, _client: RedmineClient) => {},
    );

    const registry = [
      {
        name: "redmine_read_example",
        access: "read",
        register: readRegister,
      },
      {
        name: "redmine_write_example",
        access: "write",
        register: writeRegister,
      },
    ] satisfies readonly ToolRegistryEntry[];

    expect(
      getPublishedToolRegistry(false, registry).map(
        (entry) => entry.name,
      ),
    ).toEqual(["redmine_read_example"]);

    expect(
      getPublishedToolRegistry(true, registry).map(
        (entry) => entry.name,
      ),
    ).toEqual([
      "redmine_read_example",
      "redmine_write_example",
    ]);
  });
});
