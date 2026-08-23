import { describe, expect, it } from "vitest";

import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_TOOL_NAMES = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

const EXPECTED_DESCRIPTIONS = {
  redmine_get_current_user:
    "Retrieve the Redmine user associated with the configured API key. " +
    "Use this tool to verify Redmine authentication and determine the " +
    "identity and internal user ID used by this MCP server. This tool " +
    "retrieves only the currently authenticated user; it does not search " +
    "for arbitrary Redmine users.",
  redmine_get_issue:
    "Retrieve detailed information for a Redmine issue when its numeric " +
    "issue ID is already known. The response includes journals and issue " +
    "relations when available. Use redmine_search for free-text discovery " +
    "when the issue ID is unknown.",
  redmine_list_issues:
    "List Redmine issues using structured filters and pagination. Use " +
    "this tool when project, tracker, status, assignee, version, subject, " +
    "or sort filters are known. Subject matching is substring-based. " +
    "The default limit is 10 and the maximum is 20. This tool returns " +
    "bounded summaries; use redmine_get_issue for details.",
  redmine_get_project:
    "Retrieve detailed Redmine project metadata when the numeric project " +
    "ID or project identifier is already known. The response includes " +
    "trackers, issue categories, and issue custom field metadata when " +
    "available. Use redmine_list_projects to discover visible projects.",
  redmine_list_projects:
    "List Redmine projects visible to the configured Redmine user using " +
    "pagination. Use this tool to discover project IDs or identifiers, " +
    "then use redmine_get_project when detailed project metadata is needed.",
  redmine_search:
    "Search Redmine by free text to discover resources. Use project_id " +
    "to scope the search to one project, or omit it for a global search. " +
    "The default limit is 10 and the maximum is 20. Search results are " +
    "summaries; when an issue ID is found, use redmine_get_issue to " +
    "retrieve complete issue details. Use redmine_list_issues instead " +
    "when structured issue filters are known.",
} as const;

const EXPECTED_INPUT_PROPERTIES = {
  redmine_get_current_user: [],
  redmine_get_issue: ["issue_id"],
  redmine_get_project: ["project_id"],
  redmine_list_issues: [
    "assigned_to_id",
    "fixed_version_id",
    "limit",
    "offset",
    "project_id",
    "sort",
    "status_id",
    "subject",
    "tracker_id",
  ],
  redmine_list_projects: ["limit", "offset"],
  redmine_search: ["limit", "offset", "project_id", "query"],
} as const;

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function inputPropertyNames(inputSchema: unknown): string[] {
  const schema = requireRecord(inputSchema, "inputSchema");
  const properties = schema.properties;

  if (properties === undefined) {
    return [];
  }

  return Object.keys(
    requireRecord(properties, "inputSchema.properties"),
  ).sort();
}

function inputProperty(
  inputSchema: unknown,
  propertyName: string,
): Record<string, unknown> {
  const schema = requireRecord(inputSchema, "inputSchema");
  const properties = requireRecord(
    schema.properties,
    "inputSchema.properties",
  );
  const property = properties[propertyName];

  return requireRecord(
    property,
    `inputSchema.properties.${propertyName}`,
  );
}

function requiredProperties(inputSchema: unknown): string[] {
  const schema = requireRecord(inputSchema, "inputSchema");
  const required = schema.required;

  if (required === undefined) {
    return [];
  }

  if (
    !Array.isArray(required) ||
    !required.every((value) => typeof value === "string")
  ) {
    throw new Error("inputSchema.required must be a string array");
  }

  return [...required].sort();
}

describe("Read-only MCP public contract", () => {
  it("keeps tools/list names, descriptions, and input schemas stable", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-read-only-contract-e2e-client",
    );

    try {
      const { tools } = await client.listTools();
      const toolByName = new Map(
        tools.map((tool) => [tool.name, tool]),
      );

      expect([...toolByName.keys()].sort()).toEqual(
        [...EXPECTED_TOOL_NAMES].sort(),
      );

      for (const name of EXPECTED_TOOL_NAMES) {
        const tool = toolByName.get(name);

        expect(tool, `Missing tool: ${name}`).toBeDefined();

        if (!tool) {
          throw new Error(`Missing tool: ${name}`);
        }

        expect(tool.description).toBe(
          EXPECTED_DESCRIPTIONS[name],
        );
        expect(inputPropertyNames(tool.inputSchema)).toEqual(
          [...EXPECTED_INPUT_PROPERTIES[name]].sort(),
        );
      }

      const getIssue = toolByName.get("redmine_get_issue");
      const getProject = toolByName.get("redmine_get_project");
      const listIssues = toolByName.get("redmine_list_issues");
      const search = toolByName.get("redmine_search");

      if (!getIssue || !getProject || !listIssues || !search) {
        throw new Error("Required contract tools were not registered");
      }

      expect(requiredProperties(getIssue.inputSchema)).toEqual([
        "issue_id",
      ]);
      expect(requiredProperties(getProject.inputSchema)).toEqual([
        "project_id",
      ]);
      expect(requiredProperties(search.inputSchema)).toEqual(["query"]);

      expect(
        inputProperty(listIssues.inputSchema, "limit").maximum,
      ).toBe(20);
      expect(
        inputProperty(search.inputSchema, "limit").maximum,
      ).toBe(20);
    } finally {
      await client.close();
    }
  });

  it("keeps issue and project list responses summarized", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-summary-contract-e2e-client",
    );

    try {
      const issueResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
        },
      });

      expect(issueResult.isError).not.toBe(true);

      const issueResponse = JSON.parse(
        requireTextContent(issueResult.content),
      ) as {
        items: Array<Record<string, unknown>>;
      };

      expect(issueResponse.items.length).toBeGreaterThan(0);

      for (const issue of issueResponse.items) {
        expect(issue).not.toHaveProperty("description");
        expect(issue).not.toHaveProperty("journals");
        expect(issue).not.toHaveProperty("relations");
        expect(issue).not.toHaveProperty("customFields");
        expect(issue).not.toHaveProperty("author");
      }

      const projectResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 25,
        },
      });

      expect(projectResult.isError).not.toBe(true);

      const projectResponse = JSON.parse(
        requireTextContent(projectResult.content),
      ) as {
        items: Array<Record<string, unknown>>;
      };

      expect(projectResponse.items.length).toBeGreaterThan(0);

      for (const project of projectResponse.items) {
        expect(project).not.toHaveProperty("description");
        expect(project).not.toHaveProperty("trackers");
        expect(project).not.toHaveProperty("issueCategories");
        expect(project).not.toHaveProperty("issueCustomFields");
      }
    } finally {
      await client.close();
    }
  });
});
