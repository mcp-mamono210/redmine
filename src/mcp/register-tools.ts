import type { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "../redmine/client.js";
import { registerCurrentUserTool } from "./tools/current-user.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSearchTool } from "./tools/search.js";

export function registerReadOnlyTools(
  server: McpServer,
  redmineClient: RedmineClient,
): void {
  registerCurrentUserTool(server, redmineClient);
  registerIssueTools(server, redmineClient);
  registerProjectTools(server, redmineClient);
  registerSearchTool(server, redmineClient);
}
