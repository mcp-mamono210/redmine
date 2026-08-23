import { describe, expect, it } from "vitest";

import {
  callGetIssueTool,
  callListIssuesTool,
  getIssueInputSchema,
  listIssuesInputSchema,
  type IssueToolClient,
} from "../../src/mcp/tools/issues.js";
import type {
  RedmineIssue,
  RedmineIssueSummary,
  RedmineListIssuesParams,
  RedminePaginatedResponse,
} from "../../src/redmine/types.js";

const issue: RedmineIssue = {
  id: 42,
  project: { id: 1, name: "MCP Test Project" },
  tracker: { id: 1, name: "Bug" },
  status: { id: 1, name: "New" },
  priority: { id: 2, name: "Normal" },
  author: { id: 7, name: "MCP Test" },
  subject: "Authentication fails for invalid API token",
  description: "Representative issue",
  customFields: [],
  journals: [],
  relations: [],
};

const issueSummary: RedmineIssueSummary = {
  id: 42,
  subject: "Authentication fails for invalid API token",
  project: { id: 1, name: "MCP Test Project" },
  tracker: { id: 1, name: "Bug" },
  status: { id: 1, name: "New" },
  priority: { id: 2, name: "Normal" },
};

const issuePage: RedminePaginatedResponse<RedmineIssueSummary> = {
  items: [issueSummary],
  totalCount: 1,
  offset: 0,
  limit: 10,
};

function requireText(result: {
  content: Array<{ type: "text"; text: string }>;
}): string {
  const content = result.content[0];

  if (!content || content.type !== "text") {
    throw new Error("Expected text content");
  }

  return content.text;
}

describe("Issue read-only tools", () => {
  it("gets an issue with journals and relations included", async () => {
    let receivedIssueId: number | undefined;
    let receivedIncludes: readonly string[] | undefined;

    const client: IssueToolClient = {
      getIssue: (issueId, options) => {
        receivedIssueId = issueId;
        receivedIncludes = options?.include;
        return Promise.resolve(issue);
      },
      listIssues: () => Promise.resolve(issuePage),
    };

    const result = await callGetIssueTool(client, { issue_id: 42 });

    expect(result.isError).toBe(false);
    expect(receivedIssueId).toBe(42);
    expect(receivedIncludes).toEqual(["journals", "relations"]);
    expect(JSON.parse(requireText(result)) as unknown).toEqual(issue);
  });

  it("uses the bounded default limit and forwards snake_case filters", async () => {
    let receivedParams: RedmineListIssuesParams | undefined;

    const client: IssueToolClient = {
      getIssue: () => Promise.resolve(issue),
      listIssues: (params) => {
        receivedParams = params;
        return Promise.resolve(issuePage);
      },
    };

    const result = await callListIssuesTool(client, {
      project_id: "mcp-test",
      tracker_id: 1,
      status_id: "open",
      assigned_to_id: 7,
      fixed_version_id: 3,
      subject: "Authentication",
      offset: 0,
      sort: "updated_on:desc",
    });

    expect(result.isError).toBe(false);
    expect(receivedParams).toEqual({
      projectId: "mcp-test",
      trackerId: 1,
      statusId: "open",
      assignedToId: 7,
      fixedVersionId: 3,
      subject: "Authentication",
      offset: 0,
      limit: 10,
      sort: "updated_on:desc",
    });

    const parsed = JSON.parse(requireText(result)) as {
      items: Array<Record<string, unknown>>;
    };

    expect(parsed.items[0]).not.toHaveProperty("description");
    expect(parsed.items[0]).not.toHaveProperty("journals");
    expect(parsed.items[0]).not.toHaveProperty("relations");
  });

  it("accepts limit 20 and rejects values above the contract maximum", () => {
    expect(listIssuesInputSchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(listIssuesInputSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it("trims and validates subject filters", () => {
    const parsed = listIssuesInputSchema.parse({ subject: "  Authentication  " });
    expect(parsed.subject).toBe("Authentication");
    expect(listIssuesInputSchema.safeParse({ subject: "   " }).success).toBe(false);
  });

  it("accepts an empty list input", () => {
    expect(listIssuesInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects invalid get issue IDs", () => {
    expect(getIssueInputSchema.safeParse({ issue_id: 0 }).success).toBe(false);
    expect(getIssueInputSchema.safeParse({ issue_id: -1 }).success).toBe(false);
  });
});
