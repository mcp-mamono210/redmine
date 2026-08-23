import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_READ_ONLY_TOOLS = [
  "redmine_get_current_user",
  "redmine_get_issue",
  "redmine_get_project",
  "redmine_list_issues",
  "redmine_list_projects",
  "redmine_search",
] as const;

const currentUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string(),
});

const searchResultSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  type: z.string(),
  url: z.string(),
});

const searchResponseSchema = z.object({
  items: z.array(searchResultSchema),
  total_count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const issueSummarySchema = z.object({
  id: z.number().int().positive(),
  subject: z.string(),
});

const issueListSchema = z.object({
  items: z.array(issueSummarySchema),
  total_count: z.number().int().nonnegative(),
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
});

const projectSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  identifier: z.string(),
});

const projectListSchema = z.object({
  items: z.array(projectSummarySchema),
  total_count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

const projectDetailSchema = z.object({
  project: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    identifier: z.string(),
  }),
  trackers: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  categories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  custom_fields: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  versions: z.null(),
  members: z.null(),
  priorities: z.null(),
  warnings: z.array(z.string()),
});

function parseToolJson<T>(
  text: string,
  schema: z.ZodType<T>,
): T {
  return schema.parse(JSON.parse(text) as unknown);
}

describe("Read-only MCP E2E contract", () => {
  it("completes the v0.1.0 read-only workflows over stdio", async () => {
    const { client, redmineApiKey } = await connectE2eClient(
      "redmine-mcp-read-only-e2e-client",
    );

    try {
      const { tools } = await client.listTools();
      const actualToolNames = tools.map(({ name }) => name).sort();
      const expectedToolNames = [...EXPECTED_READ_ONLY_TOOLS].sort();

      expect(actualToolNames).toEqual(expectedToolNames);

      const currentUserResult = await client.callTool({
        name: "redmine_get_current_user",
        arguments: {},
      });

      expect(currentUserResult.isError).not.toBe(true);

      const currentUserText = requireTextContent(
        currentUserResult.content,
      );
      const currentUser = parseToolJson(
        currentUserText,
        currentUserSchema,
      );

      expect(currentUser.login).toBe("mcp-test");
      expect(currentUserText).not.toContain(redmineApiKey);

      const searchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
          limit: 20,
        },
      });

      expect(searchResult.isError).not.toBe(true);

      const searchText = requireTextContent(searchResult.content);
      const searchResponse = parseToolJson(
        searchText,
        searchResponseSchema,
      );
      const searchTarget = searchResponse.items.find(
        ({ title, type }) =>
          type.startsWith("issue") &&
          title.includes(
            "Authentication fails for invalid API token",
          ),
      );

      expect(searchTarget).toBeDefined();

      if (!searchTarget) {
        throw new Error(
          "Representative issue was not found by redmine_search",
        );
      }

      expect(searchText).not.toContain(redmineApiKey);
      expect(searchTarget.url).not.toContain(redmineApiKey);

      const searchIssueResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: searchTarget.id,
        },
      });

      expect(searchIssueResult.isError).not.toBe(true);

      const searchIssueText = requireTextContent(
        searchIssueResult.content,
      );
      const searchIssue = parseToolJson(
        searchIssueText,
        issueDetailSchema,
      );

      expect(searchIssue.id).toBe(searchTarget.id);
      expect(searchIssue.subject).toBe(
        "Authentication fails for invalid API token",
      );
      expect(searchIssue.project.name).toBe("MCP Test Project");
      expect(searchIssue.tracker.name).toBe("Bug");
      expect(searchIssue.status.name).toBe("New");
      expect(searchIssueText).not.toContain(redmineApiKey);

      const issueListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          limit: 20,
        },
      });

      expect(issueListResult.isError).not.toBe(true);

      const issueListText = requireTextContent(
        issueListResult.content,
      );
      const issueList = parseToolJson(
        issueListText,
        issueListSchema,
      );
      const listedIssue = issueList.items.find(
        ({ subject }) =>
          subject === "Authentication fails for invalid API token",
      );

      expect(listedIssue).toBeDefined();

      if (!listedIssue) {
        throw new Error(
          "Representative issue was not found by redmine_list_issues",
        );
      }

      expect(issueListText).not.toContain(redmineApiKey);

      const listedIssueResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: listedIssue.id,
        },
      });

      expect(listedIssueResult.isError).not.toBe(true);

      const listedIssueText = requireTextContent(
        listedIssueResult.content,
      );
      const listedIssueDetail = parseToolJson(
        listedIssueText,
        issueDetailSchema,
      );

      expect(listedIssueDetail.id).toBe(listedIssue.id);
      expect(listedIssueDetail.subject).toBe(
        "Authentication fails for invalid API token",
      );
      expect(listedIssueText).not.toContain(redmineApiKey);

      const projectListResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 25,
        },
      });

      expect(projectListResult.isError).not.toBe(true);

      const projectListText = requireTextContent(
        projectListResult.content,
      );
      const projectList = parseToolJson(
        projectListText,
        projectListSchema,
      );
      const project = projectList.items.find(
        ({ identifier }) => identifier === "mcp-test",
      );

      expect(project).toBeDefined();

      if (!project) {
        throw new Error(
          "MCP Test Project was not found by redmine_list_projects",
        );
      }

      expect(project.name).toBe("MCP Test Project");
      expect(projectListText).not.toContain(redmineApiKey);

      const projectResult = await client.callTool({
        name: "redmine_get_project",
        arguments: {
          project_id: project.identifier,
        },
      });

      expect(projectResult.isError).not.toBe(true);

      const projectText = requireTextContent(projectResult.content);
      const projectDetail = parseToolJson(
        projectText,
        projectDetailSchema,
      );

      expect(projectDetail.project.id).toBe(project.id);
      expect(projectDetail.project.name).toBe("MCP Test Project");
      expect(projectDetail.project.identifier).toBe("mcp-test");

      const trackerNames = projectDetail.trackers.map(
        ({ name }) => name,
      );

      expect(trackerNames).toContain("Bug");
      expect(trackerNames).toContain("Feature");
      expect(trackerNames).toContain("Task");

      expect(
        projectDetail.custom_fields.some(
          ({ name }) => name === "release_tag",
        ),
      ).toBe(true);

      expect(projectDetail.versions).toBeNull();
      expect(projectDetail.members).toBeNull();
      expect(projectDetail.priorities).toBeNull();
      expect(projectDetail.warnings).toEqual([]);
      expect(projectText).not.toContain(redmineApiKey);

      const scopedSearchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "Secondary",
          project_id: "mcp-secondary",
          limit: 20,
        },
      });

      expect(scopedSearchResult.isError).not.toBe(true);

      const scopedSearchText = requireTextContent(
        scopedSearchResult.content,
      );
      const scopedSearch = parseToolJson(
        scopedSearchText,
        searchResponseSchema,
      );

      expect(
        scopedSearch.items.some(
          ({ title, type }) =>
            type.startsWith("issue") &&
            title.includes("Secondary project search target"),
        ),
      ).toBe(true);
      expect(
        scopedSearch.items.some(({ title }) =>
          title.includes(
            "Authentication fails for invalid API token",
          ),
        ),
      ).toBe(false);
      expect(scopedSearchText).not.toContain(redmineApiKey);
    } finally {
      await client.close();
    }
  });
});
