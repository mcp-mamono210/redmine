import { McpServer } from "@modelcontextprotocol/server";
import packageJson from "../package.json" with { type: "json" };

import { AgentBriefApprovalHandler } from "./agent-brief/approval-handler.js";
import { AgentBriefLifecycleMetadataBoundary } from "./agent-brief/lifecycle-metadata.js";
import { readAgentBriefRevision } from "./agent-brief/persistence.js";
import {
  loadAgentBriefApprovalConfig,
  loadWriteGuardConfig,
} from "./config.js";
import { registerTools } from "./mcp/register-tools.js";
import type { AgentBriefApprovalToolHandler } from "./mcp/tools/agent-brief-approval.js";
import { WriteGuard } from "./mcp/write-guard.js";
import {
  createRedmineClientFromEnv,
  type RedmineClient,
} from "./redmine/client.js";
import { RedmineHttpAgentBriefLifecycleWriter } from "./redmine/issue-custom-field-writer.js";

export interface ProductionServerDependencies {
  redmineClient: RedmineClient;
  writeGuard: WriteGuard;
  agentBriefApprovalHandler?: AgentBriefApprovalToolHandler;
}

export interface CreateServerOptions {
  agentBriefApprovalHandler?: AgentBriefApprovalToolHandler;
}

function requireEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: "REDMINE_URL" | "REDMINE_API_KEY",
): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function createProductionApprovalHandler(
  env: NodeJS.ProcessEnv,
  redmineClient: RedmineClient,
  writeGuard: WriteGuard,
): AgentBriefApprovalHandler {
  const approvalConfig = loadAgentBriefApprovalConfig(env);
  const redmineUrl = requireEnvironmentValue(env, "REDMINE_URL");
  const redmineApiKey = requireEnvironmentValue(env, "REDMINE_API_KEY");
  const timeoutMs =
    env.REDMINE_TIMEOUT_MS === undefined
      ? undefined
      : Number(env.REDMINE_TIMEOUT_MS);

  const lifecycleWriter = new RedmineHttpAgentBriefLifecycleWriter({
    baseUrl: redmineUrl,
    apiKey: redmineApiKey,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  const lifecycleBoundary = new AgentBriefLifecycleMetadataBoundary(
    redmineClient,
    lifecycleWriter,
    writeGuard,
  );
  const persistenceConfig = {
    repositoryRoot: approvalConfig.repositoryRoot,
    repository: approvalConfig.repository,
    canonicalBranch: approvalConfig.canonicalBranch,
  };

  return new AgentBriefApprovalHandler(
    redmineClient,
    lifecycleBoundary,
    (issueId, briefRevision) =>
      readAgentBriefRevision(
        persistenceConfig,
        issueId,
        briefRevision,
      ),
    {
      generationInputPolicy: {
        requirementCustomFieldIds:
          approvalConfig.requirementCustomFieldIds,
        configuredSecrets: [redmineApiKey],
      },
    },
  );
}

export function createProductionServerDependencies(
  env: NodeJS.ProcessEnv = process.env,
): ProductionServerDependencies {
  const writeGuardConfig = loadWriteGuardConfig(env);
  const writeGuard = new WriteGuard(writeGuardConfig);
  const redmineClient = createRedmineClientFromEnv(env);

  if (!writeGuard.canRegisterWriteTools()) {
    return {
      redmineClient,
      writeGuard,
    };
  }

  return {
    redmineClient,
    writeGuard,
    agentBriefApprovalHandler: createProductionApprovalHandler(
      env,
      redmineClient,
      writeGuard,
    ),
  };
}

export function createServer(
  redmineClient: RedmineClient,
  writeGuard: WriteGuard,
  options: CreateServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: packageJson.version,
  });

  registerTools(server, redmineClient, {
    writeGuard,
    ...(options.agentBriefApprovalHandler === undefined
      ? {}
      : {
          agentBriefApprovalHandler:
            options.agentBriefApprovalHandler,
        }),
  });

  return server;
}

export function createProductionServer(
  env: NodeJS.ProcessEnv = process.env,
): McpServer {
  const {
    redmineClient,
    writeGuard,
    agentBriefApprovalHandler,
  } = createProductionServerDependencies(env);

  return createServer(redmineClient, writeGuard, {
    ...(agentBriefApprovalHandler === undefined
      ? {}
      : { agentBriefApprovalHandler }),
  });
}
