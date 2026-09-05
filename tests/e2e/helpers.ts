import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";

export interface McpE2eHarnessOptions {
  clientName: string;
  env?: Record<string, string | undefined>;
}

export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for MCP E2E tests`);
  }

  return value;
}

function buildServerEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const environment: Record<string, string> = {
    ...getDefaultEnvironment(),
    REDMINE_URL: requireEnvironmentVariable("REDMINE_URL"),
    REDMINE_API_KEY: requireEnvironmentVariable("REDMINE_API_KEY"),
    REDMINE_WRITE_ENABLED: "false",
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }

  return environment;
}

export async function createMcpE2eHarness(
  options: McpE2eHarnessOptions,
) {
  const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");
  const client = new Client({
    name: options.clientName,
    version: "0.0.1",
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/src/index.js")],
    env: buildServerEnvironment(options.env),
  });

  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }

    closed = true;
    await client.close();
  };

  try {
    await client.connect(transport);
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }

  return {
    redmineApiKey,
    getServerVersion: () => client.getServerVersion(),
    listTools: () => client.listTools(),
    callTool: (
      name: string,
      arguments_: Record<string, unknown> = {},
    ) =>
      client.callTool({
        name,
        arguments: arguments_,
      }),
    getTool: async (name: string) => {
      const { tools } = await client.listTools();
      return tools.find((tool) => tool.name === name);
    },
    hasTool: async (name: string) => {
      const { tools } = await client.listTools();
      return tools.some((tool) => tool.name === name);
    },
    close,
  };
}

export type McpE2eHarness = Awaited<
  ReturnType<typeof createMcpE2eHarness>
>;

export function requireTextContent(
  content: Array<
    | { type: "text"; text: string }
    | { type: string; [key: string]: unknown }
  >,
): string {
  const textContent = content.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string",
  );

  if (!textContent) {
    throw new Error("Tool result did not contain text content");
  }

  return textContent.text;
}
