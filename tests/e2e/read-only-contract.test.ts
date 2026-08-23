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
    "Retrieve core information for a Redmine issue when its numeric " +
    "issue ID is already known. Optional associated data can be requested " +
    "with include: journals, relations, children, attachments, or " +
    "allowed_statuses. By default, associated data is omitted to keep " +
    "the response bounded. Use redmine_search for free-text discovery " +
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
  redmine_get_issue: ["include", "issue_id"],
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

const EXPECTED_REQUIRED_PROPERTIES = {
  redmine_get_current_user: [],
  redmine_get_issue: ["issue_id"],
  redmine_get_project: ["project_id"],
  redmine_list_issues: [],
  redmine_list_projects: [],
  redmine_search: ["query"],
} as const;

const EXPECTED_ISSUE_INCLUDE_VALUES = [
  "allowed_statuses",
  "attachments",
  "children",
  "journals",
  "relations",
] as const;

const ISSUE_SUMMARY_KEYS = new Set([
  "assigned_to",
  "fixed_version",
  "id",
  "priority",
  "project",
  "status",
  "subject",
  "tracker",
  "updated_on",
]);

const PROJECT_SUMMARY_KEYS = new Set([
  "id",
  "identifier",
  "name",
  "parent_id",
]);

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireStringArray(
  value: unknown,
  label: string,
): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must be a string array`);
  }

  return [...value];
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

  return requireRecord(
    properties[propertyName],
    `inputSchema.properties.${propertyName}`,
  );
}

function requiredProperties(inputSchema: unknown): string[] {
  const schema = requireRecord(inputSchema, "inputSchema");
  const required = schema.required;

  if (required === undefined) {
    return [];
  }

  return requireStringArray(required, "inputSchema.required").sort();
}

function enumValues(
  inputSchema: unknown,
  propertyName: string,
): string[] {
  const property = inputProperty(inputSchema, propertyName);
  const items = requireRecord(
    property.items,
    `inputSchema.properties.${propertyName}.items`,
  );

  return requireStringArray(
    items.enum,
    `inputSchema.properties.${propertyName}.items.enum`,
  ).sort();
}

function expectOnlyKnownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    expect(
      allowedKeys.has(key),
      `Unexpected public response key: ${key}`,
    ).toBe(true);
  }
}

function expectSnakeCaseKeys(
  value: unknown,
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      expectSnakeCaseKeys(item, `${path}[${index}]`);
    });
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    expect(
      key,
      `Public JSON key must not contain uppercase characters: ${path}.${key}`,
    ).not.toMatch(/[A-Z]/);
    expectSnakeCaseKeys(child, `${path}.${key}`);
  }
}

describe("Read-only MCP public contract", () => {
  it("keeps tools/list names, descriptions, required fields, bounds, and include enum stable", async () => {
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
        expect(requiredProperties(tool.inputSchema)).toEqual(
          [...EXPECTED_REQUIRED_PROPERTIES[name]].sort(),
        );
      }

      const getIssue = toolByName.get("redmine_get_issue");
      const listIssues = toolByName.get("redmine_list_issues");
      const listProjects = toolByName.get("redmine_list_projects");
      const search = toolByName.get("redmine_search");

      if (!getIssue || !listIssues || !listProjects || !search) {
        throw new Error("Required contract tools were not registered");
      }

      expect(
        inputProperty(listIssues.inputSchema, "limit").maximum,
      ).toBe(20);
      expect(
        inputProperty(search.inputSchema, "limit").maximum,
      ).toBe(20);
      expect(
        inputProperty(listProjects.inputSchema, "limit").maximum,
      ).toBe(100);

      const includeProperty = inputProperty(
        getIssue.inputSchema,
        "include",
      );

      expect(includeProperty.minItems).toBe(1);
      expect(includeProperty.maxItems).toBe(5);
      expect(enumValues(getIssue.inputSchema, "include")).toEqual(
        [...EXPECTED_ISSUE_INCLUDE_VALUES].sort(),
      );
    } finally {
      await client.close();
    }
  });

  it("enforces list and search pagination defaults and maximum bounds", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-pagination-contract-e2e-client",
    );

    try {
      const defaultIssueResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
        },
      });

      expect(defaultIssueResult.isError).not.toBe(true);

      const defaultIssueResponse = JSON.parse(
        requireTextContent(defaultIssueResult.content),
      ) as Record<string, unknown>;

      expect(defaultIssueResponse.limit).toBe(10);

      const maximumIssueResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          limit: 20,
        },
      });

      expect(maximumIssueResult.isError).not.toBe(true);

      const maximumIssueResponse = JSON.parse(
        requireTextContent(maximumIssueResult.content),
      ) as Record<string, unknown>;

      expect(maximumIssueResponse.limit).toBe(20);

      const overLimitIssueResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          limit: 21,
        },
      });

      expect(overLimitIssueResult.isError).toBe(true);

      const defaultSearchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "Authentication",
        },
      });

      expect(defaultSearchResult.isError).not.toBe(true);

      const defaultSearchResponse = JSON.parse(
        requireTextContent(defaultSearchResult.content),
      ) as Record<string, unknown>;

      expect(defaultSearchResponse.limit).toBe(10);

      const maximumSearchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "Authentication",
          limit: 20,
        },
      });

      expect(maximumSearchResult.isError).not.toBe(true);

      const maximumSearchResponse = JSON.parse(
        requireTextContent(maximumSearchResult.content),
      ) as Record<string, unknown>;

      expect(maximumSearchResponse.limit).toBe(20);

      const overLimitSearchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "Authentication",
          limit: 21,
        },
      });

      expect(overLimitSearchResult.isError).toBe(true);

      const maximumProjectResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 100,
        },
      });

      expect(maximumProjectResult.isError).not.toBe(true);

      const overLimitProjectResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 101,
        },
      });

      expect(overLimitProjectResult.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("keeps issue and project list responses summarized and snake_case", async () => {
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
        total_count: number;
        offset: number;
        limit: number;
      };

      expect(issueResponse.items.length).toBeGreaterThan(0);
      expect(issueResponse.total_count).toBeGreaterThan(0);
      expect(issueResponse.limit).toBe(10);
      expectSnakeCaseKeys(issueResponse);

      for (const issue of issueResponse.items) {
        expectOnlyKnownKeys(issue, ISSUE_SUMMARY_KEYS);
        expect(issue).toHaveProperty("id");
        expect(issue).toHaveProperty("subject");
        expect(issue).toHaveProperty("project");
        expect(issue).toHaveProperty("tracker");
        expect(issue).toHaveProperty("status");
        expect(issue).toHaveProperty("priority");

        expect(issue).not.toHaveProperty("description");
        expect(issue).not.toHaveProperty("journals");
        expect(issue).not.toHaveProperty("relations");
        expect(issue).not.toHaveProperty("children");
        expect(issue).not.toHaveProperty("attachments");
        expect(issue).not.toHaveProperty("allowed_statuses");
        expect(issue).not.toHaveProperty("custom_fields");
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
        total_count: number;
        offset: number;
        limit: number;
      };

      expect(projectResponse.items.length).toBeGreaterThan(0);
      expect(projectResponse.total_count).toBeGreaterThan(0);
      expectSnakeCaseKeys(projectResponse);

      for (const project of projectResponse.items) {
        expectOnlyKnownKeys(project, PROJECT_SUMMARY_KEYS);
        expect(project).toHaveProperty("id");
        expect(project).toHaveProperty("name");
        expect(project).toHaveProperty("identifier");

        expect(project).not.toHaveProperty("description");
        expect(project).not.toHaveProperty("trackers");
        expect(project).not.toHaveProperty("categories");
        expect(project).not.toHaveProperty("issue_categories");
        expect(project).not.toHaveProperty("custom_fields");
        expect(project).not.toHaveProperty("versions");
        expect(project).not.toHaveProperty("members");
        expect(project).not.toHaveProperty("priorities");
        expect(project).not.toHaveProperty("warnings");
      }
    } finally {
      await client.close();
    }
  });
});
