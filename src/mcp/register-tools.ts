import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../redmine/client.js";
import { registerCurrentUserTool } from "./tools/current-user.js";

export function registerReadOnlyTools(
  server: McpServer,
  redmineClient: RedmineClient,
): void {
  registerCurrentUserTool(server, redmineClient);
}
