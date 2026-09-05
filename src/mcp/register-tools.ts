import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../redmine/client.js";
import { WriteGuard } from "./write-guard.js";
import { getPublishedToolRegistry } from "./tool-registry.js";

export interface RegisterToolsOptions {
  writeGuard: WriteGuard;
}

export function registerTools(
  server: McpServer,
  redmineClient: RedmineClient,
  options: RegisterToolsOptions,
): void {
  for (const entry of getPublishedToolRegistry(
    options.writeGuard.canRegisterWriteTools(),
  )) {
    entry.register(server, redmineClient, options.writeGuard);
  }
}

export function registerReadOnlyTools(
  server: McpServer,
  redmineClient: RedmineClient,
): void {
  registerTools(server, redmineClient, {
    writeGuard: new WriteGuard({
      writeEnabled: false,
      allowedProjects: [],
    }),
  });
}
