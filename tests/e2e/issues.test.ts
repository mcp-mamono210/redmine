import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const issueSummarySchema = z.object({
  id: z.number().int().positive(),
  subject: z.string(),
});

const issueListSchema = z.object({
  items: z.array(issueSummarySchema),
  totalCount: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const issueDetailSchema = z.object({
  id: z.number().int().positive(),
  subject: z.string(),
  project: z.object({
    id: z.number().int().positive(),
    name: z.string(),
  }),
  tracker: z.object({
    id: z.number().int().positive(),
    name: z.string(),
  }),
  status: z.object({
    id: z.number().int().positive(),
    name: z.string(),
  }),
  journals: z.array(z.unknown()).optional(),
  relations: z.array(z.unknown()).optional(),
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

describe("Issue read-only MCP E2E", () => {
  it("lists issues and retrieves one issue without fixed database IDs", async () => {
    const redmineUrl = requireEnvironmentVariable("REDMINE_URL");
    const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");

    const client = new Client({
      name: "redmine-mcp-issues-e2e-client",
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

      expect(toolNames).toContain("redmine_get_current_user");
      expect(toolNames).toContain("redmine_get_issue");
      expect(toolNames).toContain("redmine_list_issues");

      const listResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          limit: 25,
        },
      });

      expect(listResult.isError).not.toBe(true);

      const listText = requireTextContent(listResult.content);
      const parsedList = issueListSchema.parse(
        JSON.parse(listText) as unknown,
      );

      const target = parsedList.items.find(
        ({ subject }) =>
          subject === "Authentication fails for invalid API token",
      );

      expect(target).toBeDefined();

      if (!target) {
        throw new Error("Representative issue was not found");
      }

      const getResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: target.id,
        },
      });

      expect(getResult.isError).not.toBe(true);

      const getText = requireTextContent(getResult.content);
      const parsedIssue = issueDetailSchema.parse(
        JSON.parse(getText) as unknown,
      );

      expect(parsedIssue.id).toBe(target.id);
      expect(parsedIssue.subject).toBe(
        "Authentication fails for invalid API token",
      );
      expect(parsedIssue.project.name).toBe("MCP Test Project");
      expect(parsedIssue.tracker.name).toBe("Bug");
      expect(parsedIssue.status.name).toBe("New");
      expect(getText).not.toContain(redmineApiKey);
    } finally {
      await client.close();
    }
  });
});
