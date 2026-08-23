import { describe, expect, it } from "vitest";

import {
  callSearchTool,
  searchInputSchema,
  type SearchToolClient,
} from "../../src/mcp/tools/search.js";
import type {
  RedminePaginatedResponse,
  RedmineSearchParams,
  RedmineSearchResult,
} from "../../src/redmine/types.js";

const searchPage: RedminePaginatedResponse<RedmineSearchResult> = {
  items: [
    {
      id: 42,
      title: "Authentication fails for invalid API token",
      type: "issue",
      url: "http://redmine.example.test/issues/42",
    },
  ],
  totalCount: 1,
  offset: 0,
  limit: 10,
};

describe("Search read-only tool", () => {
  it("uses the bounded default limit", async () => {
    let receivedParams: RedmineSearchParams | undefined;

    const client: SearchToolClient = {
      search: (params) => {
        receivedParams = params;
        return Promise.resolve(searchPage);
      },
    };

    const result = await callSearchTool(client, {
      query: "  authentication  ",
    });

    expect(result.isError).toBe(false);
    expect(receivedParams).toEqual({
      query: "authentication",
      projectId: undefined,
      offset: undefined,
      limit: 10,
    });
  });

  it("accepts limit 20 and rejects values above the contract maximum", () => {
    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        limit: 20,
      }).success,
    ).toBe(true);

    expect(
      searchInputSchema.safeParse({
        query: "authentication",
        limit: 21,
      }).success,
    ).toBe(false);
  });

  it("rejects empty and whitespace-only queries", () => {
    expect(searchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(searchInputSchema.safeParse({ query: "   " }).success).toBe(false);
  });
});
