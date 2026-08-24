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

function requireText(result: {
  content: Array<{ type: "text"; text: string }>;
}): string {
  const content = result.content[0];

  if (!content || content.type !== "text") {
    throw new Error("Expected text content");
  }

  return content.text;
}

function requireStructuredContent(result: {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
}): Record<string, unknown> {
  if (!result.structuredContent) {
    throw new Error("Expected structuredContent");
  }

  return result.structuredContent;
}

describe("Search read-only tool", () => {
  it("uses the bounded default limit and returns matching structured output", async () => {
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

    const text = requireText(result);
    const response = JSON.parse(text) as Record<string, unknown>;
    const structured = requireStructuredContent(result);

    expect(response).toHaveProperty("total_count", 1);
    expect(response).not.toHaveProperty("totalCount");
    expect(structured).toEqual(response);
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
    expect(
      searchInputSchema.safeParse({ query: "   " }).success,
    ).toBe(false);
  });
});
