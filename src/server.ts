import { McpServer } from "@modelcontextprotocol/server";

import { registerReadOnlyTools } from "./mcp/register-tools.js";
import type { RedmineClient } from "./redmine/client.js";

export function createServer(redmineClient: RedmineClient): McpServer {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: "0.0.1",
  });

  registerReadOnlyTools(server, redmineClient);

  return server;
}
