import { McpServer } from "@modelcontextprotocol/server";

import type { RedmineClient } from "./redmine/client.js";

interface CurrentUserResponse {
  user?: {
    id?: number;
    login?: string;
    firstname?: string;
    lastname?: string;
    mail?: string;
  };
}

function normalizeCurrentUser(response: unknown): CurrentUserResponse["user"] {
  if (typeof response !== "object" || response === null || !("user" in response)) {
    throw new Error("Redmine returned an invalid current-user response");
  }

  const user = (response as CurrentUserResponse).user;

  if (!user || typeof user.id !== "number" || typeof user.login !== "string") {
    throw new Error("Redmine returned an invalid current-user response");
  }

  return {
    id: user.id,
    login: user.login,
    firstname: user.firstname,
    lastname: user.lastname,
    mail: user.mail,
  };
}

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
        const response = await redmineClient.getCurrentUser();
        const user = normalizeCurrentUser(response);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(user),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown Redmine error";

        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
