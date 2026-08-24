import { describe, expect, it } from "vitest";

import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_STRUCTURED_TOOLS = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

interface IssueSummary {
  id: number;
  subject: string;
}

interface IssueListResponse {
  items: IssueSummary[];
}

interface ProjectSummary {
  identifier: string;
}

interface ProjectListResponse {
  items: ProjectSummary[];
}

function requireStructuredContent(result: {
  content: unknown;
  structuredContent?: unknown;
}): Record<string, unknown> {
  const { structuredContent } = result;

  if (
    typeof structuredContent !== "object" ||
    structuredContent === null ||
    Array.isArray(structuredContent)
  ) {
    throw new Error("Tool result did not contain structuredContent");
  }

  return structuredContent as Record<string, unknown>;
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

  for (const [key, nestedValue] of Object.entries(value)) {
    expect(
      key,
      `Structured output key must be snake_case: ${path}.${key}`,
    ).not.toMatch(/[A-Z]/);

    expectSnakeCaseKeys(
      nestedValue,
      `${path}.${key}`,
    );
  }
}

function expectStructuredMatchesText(result: {
  content: Parameters<typeof requireTextContent>[0];
  structuredContent?: unknown;
}, redmineApiKey: string): Record<string, unknown> {
  const text = requireTextContent(result.content);
  const structured = requireStructuredContent(result);

  expect(structured).toEqual(
    JSON.parse(text) as Record<string, unknown>,
  );
  expectSnakeCaseKeys(structured);

  expect(text).not.toContain(redmineApiKey);
  expect(JSON.stringify(structured)).not.toContain(
    redmineApiKey,
  );

  return structured;
}

describe("MCP Structured Output E2E", () => {
  it("publishes output schemas for every read-only tool", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-structured-output-tools-e2e-client",
    );

    try {
      const { tools } = await client.listTools();
      const toolByName = new Map(
        tools.map((tool) => [tool.name, tool]),
      );

      for (const name of EXPECTED_STRUCTURED_TOOLS) {
        const tool = toolByName.get(name);

        expect(
          tool,
          `Missing read-only tool: ${name}`,
        ).toBeDefined();

        if (!tool) {
          throw new Error(`Missing read-only tool: ${name}`);
        }

        expect(
          tool.outputSchema,
          `Missing outputSchema: ${name}`,
        ).toBeDefined();
      }
    } finally {
      await client.close();
    }
  });

  it("returns matching text and structured output for all read-only tools", async () => {
    const { client, redmineApiKey } = await connectE2eClient(
      "redmine-mcp-structured-output-results-e2e-client",
    );

    try {
      const currentUserResult = await client.callTool({
        name: "redmine_get_current_user",
        arguments: {},
      });

      expect(currentUserResult.isError).not.toBe(true);

      expectStructuredMatchesText(
        currentUserResult,
        redmineApiKey,
      );

      const issueListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          limit: 20,
        },
      });

      expect(issueListResult.isError).not.toBe(true);

      const issueList =
        expectStructuredMatchesText(
          issueListResult,
          redmineApiKey,
        ) as unknown as IssueListResponse;

      const issue = issueList.items.find(
        ({ subject }) =>
          subject ===
          "Authentication fails for invalid API token",
      );

      expect(issue).toBeDefined();

      if (!issue) {
        throw new Error(
          "Representative issue was not found",
        );
      }

      const issueResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: issue.id,
          include: ["allowed_statuses"],
        },
      });

      expect(issueResult.isError).not.toBe(true);

      const issueStructured = expectStructuredMatchesText(
        issueResult,
        redmineApiKey,
      );

      expect(issueStructured).toHaveProperty(
        "allowed_statuses",
      );

      const searchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
        },
      });

      expect(searchResult.isError).not.toBe(true);

      expectStructuredMatchesText(
        searchResult,
        redmineApiKey,
      );

      const projectListResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 25,
        },
      });

      expect(projectListResult.isError).not.toBe(true);

      const projectList =
        expectStructuredMatchesText(
          projectListResult,
          redmineApiKey,
        ) as unknown as ProjectListResponse;

      const project = projectList.items.find(
        ({ identifier }) =>
          identifier === "mcp-test",
      );

      expect(project).toBeDefined();

      if (!project) {
        throw new Error(
          "MCP Test Project was not found",
        );
      }

      const projectResult = await client.callTool({
        name: "redmine_get_project",
        arguments: {
          project_id: project.identifier,
        },
      });

      expect(projectResult.isError).not.toBe(true);

      const projectStructured =
        expectStructuredMatchesText(
          projectResult,
          redmineApiKey,
        );

      expect(projectStructured).toHaveProperty("project");
      expect(projectStructured).toHaveProperty("trackers");
      expect(projectStructured).toHaveProperty("categories");
      expect(projectStructured).toHaveProperty(
        "custom_fields",
      );
      expect(projectStructured).toHaveProperty("versions");
      expect(projectStructured).toHaveProperty("members");
      expect(projectStructured).toHaveProperty(
        "priorities",
      );
      expect(projectStructured).toHaveProperty("warnings");
    } finally {
      await client.close();
    }
  });
});
