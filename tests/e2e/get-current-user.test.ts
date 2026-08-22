import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

interface CurrentUser {
  id: number;
  login: string;
  firstname?: string;
  lastname?: string;
  mail?: string;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

describe("redmine_get_current_user MCP E2E", () => {
  it("lists and calls the tool over stdio against Docker Redmine", async () => {
    const redmineUrl = requireEnvironmentVariable("REDMINE_URL");
    const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");

    const client = new Client({
      name: "redmine-mcp-e2e-client",
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

    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      const tool = tools.find(
        ({ name }) => name === "redmine_get_current_user",
      );

      expect(tool).toBeDefined();

      const result = await client.callTool({
        name: "redmine_get_current_user",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);

      const textContent = result.content.find(
        (content) => content.type === "text",
      );

      expect(textContent).toBeDefined();

      if (!textContent || textContent.type !== "text") {
        throw new Error("Tool result did not contain text content");
      }

      const user = JSON.parse(textContent.text) as CurrentUser;

      expect(user.id).toBeGreaterThan(0);
      expect(user.login).toBe("mcp-test");
      expect(textContent.text).not.toContain(redmineApiKey);
    } finally {
      await client.close();
    }
  });
});
