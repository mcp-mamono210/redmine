import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../redmine/client.js";
import { registerCurrentUserTool } from "./tools/current-user.js";
import {
  registerGetIssueTool,
  registerListIssuesTool,
} from "./tools/issues.js";
import {
  registerGetProjectTool,
  registerListProjectsTool,
} from "./tools/projects.js";
import { registerSearchTool } from "./tools/search.js";

export type ToolAccess = "read" | "write";

export interface ToolRegistryEntry {
  name: string;
  access: ToolAccess;
  register(
    server: McpServer,
    redmineClient: RedmineClient,
  ): void;
}

export const toolRegistry = [
  {
    name: "redmine_get_current_user",
    access: "read",
    register: registerCurrentUserTool,
  },
  {
    name: "redmine_get_issue",
    access: "read",
    register: registerGetIssueTool,
  },
  {
    name: "redmine_list_issues",
    access: "read",
    register: registerListIssuesTool,
  },
  {
    name: "redmine_search",
    access: "read",
    register: registerSearchTool,
  },
  {
    name: "redmine_get_project",
    access: "read",
    register: registerGetProjectTool,
  },
  {
    name: "redmine_list_projects",
    access: "read",
    register: registerListProjectsTool,
  },
] as const satisfies readonly ToolRegistryEntry[];

export function assertUniqueToolNames(
  entries: readonly ToolRegistryEntry[] = toolRegistry,
): void {
  const names = new Set<string>();

  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new Error(
        `Duplicate MCP tool name in registry: ${entry.name}`,
      );
    }

    names.add(entry.name);
  }
}

export function getPublishedToolRegistry(
  writeEnabled: boolean,
  entries: readonly ToolRegistryEntry[] = toolRegistry,
): readonly ToolRegistryEntry[] {
  assertUniqueToolNames(entries);

  return entries.filter(
    (entry) => entry.access === "read" || writeEnabled,
  );
}
