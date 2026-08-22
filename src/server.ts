import { McpServer } from "@modelcontextprotocol/server";

/**
 * Creates the Redmine MCP Server instance.
 *
 * Transport, tools, and the Redmine client will be added in later phases.
 */
export function createServer(): McpServer {
  return new McpServer({
    name: "redmine-mcp-server",
    version: "0.0.1",
  });
}
