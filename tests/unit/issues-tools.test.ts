import { describe, expect, it } from "vitest";

import {
  callGetIssueTool,
  callListIssuesTool,
  getIssueInputSchema,
  listIssuesInputSchema,
  type IssueToolClient,
} from "../../src/mcp/tools/issues.js";
import { RedmineHttpError } from "../../src/redmine/errors.js";
import type {
  RedmineIssue,
  RedmineIssueSummary,
  RedmineListIssuesParams,
  RedminePaginatedResponse,
} from "../../src/redmine/types.js";

const apiKey = "0123456789abcdef0123456789abcdef01234567";

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

const issuePage: RedminePaginatedResponse<RedmineIssueSummary> = {
  items: [issue],
  totalCount: 1,
  offset: 0,
  limit: 25,
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

  it("maps a missing issue through the shared error model", async () => {
    const client: IssueToolClient = {
      getIssue: () =>
        Promise.reject(
          new RedmineHttpError({
            method: "GET",
            path: "/issues/999999.json",
            status: 404,
            statusText: "Not Found",
            errors: [`secret ${apiKey}`],
          }),
        ),
      listIssues: () => Promise.resolve(issuePage),
    };

    const result = await callGetIssueTool(client, { issue_id: 999999 });
    const text = requireText(result);

    expect(result.isError).toBe(true);
    expect(text).toContain('"code":"not_found"');
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain("secret");
  });

  it("maps snake_case list inputs to RedmineClient camelCase params", async () => {
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
      offset: 10,
      limit: 25,
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
      offset: 10,
      limit: 25,
      sort: "updated_on:desc",
    });
    expect(JSON.parse(requireText(result)) as unknown).toEqual(issuePage);
  });

  it("accepts an empty list input", () => {
    expect(listIssuesInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects invalid get issue IDs", () => {
    expect(getIssueInputSchema.safeParse({ issue_id: 0 }).success).toBe(false);
    expect(getIssueInputSchema.safeParse({ issue_id: -1 }).success).toBe(false);
  });

  it("rejects invalid pagination values", () => {
    expect(
      listIssuesInputSchema.safeParse({ offset: -1 }).success,
    ).toBe(false);
    expect(
      listIssuesInputSchema.safeParse({ limit: 0 }).success,
    ).toBe(false);
    expect(
      listIssuesInputSchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });
});
