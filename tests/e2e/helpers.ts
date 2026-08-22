import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";

export interface E2eClientContext {
  client: Client;
  redmineApiKey: string;
}

export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for MCP E2E tests`);
  }

  return value;
}

export async function connectE2eClient(
  clientName: string,
): Promise<E2eClientContext> {
  const redmineUrl = requireEnvironmentVariable("REDMINE_URL");
  const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");

  const client = new Client({
    name: clientName,
    version: "0.0.1",
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/src/index.js")],
    env: {
      ...getDefaultEnvironment(),
      REDMINE_URL: redmineUrl,
      REDMINE_API_KEY: redmineApiKey,
    },
  });

  await client.connect(transport);

  return {
    client,
    redmineApiKey,
  };
}

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
