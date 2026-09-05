import { McpServer } from "@modelcontextprotocol/server";

import { loadWriteGuardConfig } from "./config.js";
import { registerTools } from "./mcp/register-tools.js";
import { WriteGuard } from "./mcp/write-guard.js";
import {
  createRedmineClientFromEnv,
  type RedmineClient,
} from "./redmine/client.js";

export interface ProductionServerDependencies {
  redmineClient: RedmineClient;
  writeGuard: WriteGuard;
}

export function createProductionServerDependencies(
  env: NodeJS.ProcessEnv = process.env,
): ProductionServerDependencies {
  const writeGuardConfig = loadWriteGuardConfig(env);
  const writeGuard = new WriteGuard(writeGuardConfig);
  const redmineClient = createRedmineClientFromEnv(env);

  return {
    redmineClient,
    writeGuard,
  };
}

export function createServer(
  redmineClient: RedmineClient,
  writeGuard: WriteGuard,
): McpServer {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: "0.1.0",
  });

  registerTools(server, redmineClient, {
    writeGuard,
  });

  return server;
}

export function createProductionServer(
  env: NodeJS.ProcessEnv = process.env,
): McpServer {
  const { redmineClient, writeGuard } =
    createProductionServerDependencies(env);

  return createServer(redmineClient, writeGuard);
}
