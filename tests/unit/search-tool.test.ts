import { describe, expect, it } from "vitest";

import {
  callSearchTool,
  searchInputSchema,
  type SearchToolClient,
} from "../../src/mcp/tools/search.js";
import { RedmineNetworkError } from "../../src/redmine/errors.js";
import type {
  RedminePaginatedResponse,
  RedmineSearchParams,
  RedmineSearchResult,
} from "../../src/redmine/types.js";

const apiKey = "0123456789abcdef0123456789abcdef01234567";

const searchPage: RedminePaginatedResponse<RedmineSearchResult> = {
  items: [
    {
      id: 42,
      title: "Authentication fails for invalid API token",
      type: "issue",
      url: "http://redmine.example.test/issues/42",
      description: "Representative issue",
      datetime: "2026-08-22T00:00:00Z",
    },
  ],
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

describe("Search read-only tool", () => {
  it("performs a global search and trims the query", async () => {
    let receivedParams: RedmineSearchParams | undefined;

    const client: SearchToolClient = {
      search: (params) => {
        receivedParams = params;
        return Promise.resolve(searchPage);
      },
    };

    const result = await callSearchTool(client, {
      query: "  authentication  ",
      offset: 0,
      limit: 25,
    });

    expect(result.isError).toBe(false);
    expect(receivedParams).toEqual({
      query: "authentication",
      projectId: undefined,
      offset: 0,
      limit: 25,
    });
    expect(JSON.parse(requireText(result)) as unknown).toEqual(searchPage);
  });

  it("maps project_id to RedmineClient projectId", async () => {
    let receivedParams: RedmineSearchParams | undefined;

    const client: SearchToolClient = {
      search: (params) => {
        receivedParams = params;
        return Promise.resolve(searchPage);
      },
    };

    const result = await callSearchTool(client, {
      query: "secondary",
      project_id: "mcp-secondary",
      limit: 10,
    });

    expect(result.isError).toBe(false);
    expect(receivedParams).toEqual({
      query: "secondary",
      projectId: "mcp-secondary",
      offset: undefined,
      limit: 10,
    });
  });

  it("maps network failures through the shared error model without leaking credentials", async () => {
    const client: SearchToolClient = {
      search: () =>
        Promise.reject(
          new RedmineNetworkError(
            `request failed with API key ${apiKey}`,
            "GET",
            "/search.json",
          ),
        ),
    };

    const result = await callSearchTool(client, {
      query: "authentication",
    });
    const text = requireText(result);

    expect(result.isError).toBe(true);
    expect(text).toContain('"code":"backend_unavailable"');
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain("request failed");
  });

  it("accepts valid search inputs", () => {
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
      }).success,
    ).toBe(true);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        project_id: "mcp-test",
        offset: 0,
        limit: 1,
      }).success,
    ).toBe(true);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        project_id: 1,
        limit: 100,
      }).success,
    ).toBe(true);
  });

  it("trims the query during schema parsing", () => {
    const parsed = searchInputSchema.parse({
      query: "  authentication  ",
    });

    expect(parsed.query).toBe("authentication");
  });

  it("rejects empty and whitespace-only queries", () => {
    expect(
      searchInputSchema.safeParse({
        query: "",
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid project IDs and pagination values", () => {
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        project_id: "",
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        project_id: 0,
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        project_id: -1,
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        offset: -1,
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        limit: 0,
      }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        limit: 101,
      }).success,
    ).toBe(false);
  });
});
