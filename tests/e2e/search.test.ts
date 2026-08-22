import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const searchResultSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  type: z.string(),
  url: z.string(),
  description: z.string().optional(),
  datetime: z.string().optional(),
});

const searchResponseSchema = z.object({
  items: z.array(searchResultSchema),
  totalCount: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function requireTextContent(
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

describe("Search read-only MCP E2E", () => {
  it("performs global and project-scoped searches without leaking the API key", async () => {
    const redmineUrl = requireEnvironmentVariable("REDMINE_URL");
    const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");

    const client = new Client({
      name: "redmine-mcp-search-e2e-client",
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
      const toolNames = tools.map(({ name }) => name);

      expect(toolNames).toContain("redmine_search");

      const globalResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
          limit: 25,
        },
      });

      expect(globalResult.isError).not.toBe(true);

      const globalText = requireTextContent(globalResult.content);
      const globalSearch = searchResponseSchema.parse(
        JSON.parse(globalText) as unknown,
      );

      expect(
        globalSearch.items.some(
          ({ title, type }) =>
            type.startsWith("issue") &&
            title.includes(
              "Authentication fails for invalid API token",
            ),
        ),
      ).toBe(true);

      expect(globalText).not.toContain(redmineApiKey);

      const projectResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "Secondary",
          project_id: "mcp-secondary",
          limit: 25,
        },
      });

      expect(projectResult.isError).not.toBe(true);

      const projectText = requireTextContent(projectResult.content);
      const projectSearch = searchResponseSchema.parse(
        JSON.parse(projectText) as unknown,
      );

      expect(
        projectSearch.items.some(
          ({ title, type }) =>
            type.startsWith("issue") &&
            title.includes("Secondary project search target"),
        ),
      ).toBe(true);

      expect(projectText).not.toContain(redmineApiKey);
    } finally {
      await client.close();
    }
  });
});
