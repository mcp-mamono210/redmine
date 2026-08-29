import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../redmine/client.js";
import { getPublishedToolRegistry } from "./tool-registry.js";

export interface RegisterToolsOptions {
  writeEnabled: boolean;
}

export function registerTools(
  server: McpServer,
  redmineClient: RedmineClient,
  options: RegisterToolsOptions,
): void {
  for (const entry of getPublishedToolRegistry(
    options.writeEnabled,
  )) {
    entry.register(server, redmineClient);
  }
}

export function registerReadOnlyTools(
  server: McpServer,
  redmineClient: RedmineClient,
): void {
  registerTools(server, redmineClient, {
    writeEnabled: false,
  });
}
