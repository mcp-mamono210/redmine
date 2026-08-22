import { McpServer } from "@modelcontextprotocol/server";

import { toToolErrorResult } from "./mcp/errors.js";
import type { RedmineClient } from "./redmine/client.js";

export function createServer(redmineClient: RedmineClient): McpServer {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: "0.0.1",
  });

  server.registerTool(
    "redmine_get_current_user",
    {
      description:
        "Retrieve the Redmine user associated with the configured API key. " +
        "Use this tool to verify Redmine authentication and determine the " +
        "identity and internal user ID used by this MCP server. This tool " +
        "retrieves only the currently authenticated user; it does not search " +
        "for arbitrary Redmine users.",
    },
    async () => {
      try {
        const user = await redmineClient.getCurrentUser();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(user),
            },
          ],
        };
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  return server;
}
