import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const projectSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  identifier: z.string(),
});

const projectListSchema = z.object({
  items: z.array(projectSummarySchema),
  totalCount: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const projectDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  identifier: z.string(),
  trackers: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  issueCategories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  issueCustomFields: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
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

describe("Project read-only MCP E2E", () => {
  it("lists projects and retrieves project metadata without fixed database IDs", async () => {
    const redmineUrl = requireEnvironmentVariable("REDMINE_URL");
    const redmineApiKey = requireEnvironmentVariable("REDMINE_API_KEY");

    const client = new Client({
      name: "redmine-mcp-projects-e2e-client",
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
      expect(toolNames).toContain("redmine_get_project");
      expect(toolNames).toContain("redmine_list_projects");

      const listResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 25,
        },
      });

      expect(listResult.isError).not.toBe(true);

      const listText = requireTextContent(listResult.content);
      const parsedList = projectListSchema.parse(
        JSON.parse(listText) as unknown,
      );

      const target = parsedList.items.find(
        ({ identifier }) => identifier === "mcp-test",
      );
      const secondary = parsedList.items.find(
        ({ identifier }) => identifier === "mcp-secondary",
      );

      expect(target).toBeDefined();
      expect(secondary).toBeDefined();

      if (!target) {
        throw new Error("MCP Test Project was not found");
      }

      expect(target.name).toBe("MCP Test Project");

      if (secondary) {
        expect(secondary.name).toBe("MCP Secondary Project");
      }

      const getResult = await client.callTool({
        name: "redmine_get_project",
        arguments: {
          project_id: target.identifier,
        },
      });

      expect(getResult.isError).not.toBe(true);

      const getText = requireTextContent(getResult.content);
      const parsedProject = projectDetailSchema.parse(
        JSON.parse(getText) as unknown,
      );

      expect(parsedProject.id).toBe(target.id);
      expect(parsedProject.name).toBe("MCP Test Project");
      expect(parsedProject.identifier).toBe("mcp-test");

      const trackerNames = parsedProject.trackers.map(({ name }) => name);

      expect(trackerNames).toContain("Bug");
      expect(trackerNames).toContain("Feature");
      expect(trackerNames).toContain("Task");

      expect(
        parsedProject.issueCustomFields.some(
          ({ name }) => name === "release_tag",
        ),
      ).toBe(true);

      expect(getText).not.toContain(redmineApiKey);
    } finally {
      await client.close();
    }
  });
});
