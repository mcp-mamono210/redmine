import type { McpServer } from "@modelcontextprotocol/server";

import { toToolErrorResult } from "../errors.js";
import type { RedmineUser } from "../../redmine/types.js";

export interface CurrentUserClient {
  getCurrentUser(): Promise<RedmineUser>;
}

export async function callCurrentUserTool(
  redmineClient: CurrentUserClient,
) {
  try {
    const user = await redmineClient.getCurrentUser();

    return {
      isError: false,
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
}

export function registerCurrentUserTool(
  server: McpServer,
  redmineClient: CurrentUserClient,
): void {
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
    () => callCurrentUserTool(redmineClient),
  );
}
