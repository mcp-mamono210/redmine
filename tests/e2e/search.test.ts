import { describe, expect, it } from "vitest";

import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

const AUTHENTICATION_SUBJECT =
  "Authentication fails for invalid API token";

describe("Search read-only MCP E2E", () => {
  it("discovers an issue by free text and retrieves its detail by discovered ID", async () => {
    const harness = await createMcpE2eHarness({
      clientName:
        "redmine-mcp-search-issue-workflow-e2e-client",
    });

    try {
      const searchResult = await harness.callTool(
        "redmine_search",
        {
          query: "authentication",
        },
      );

      expect(searchResult.isError).not.toBe(true);

      const search = JSON.parse(
        requireTextContent(searchResult.content),
      ) as {
        items: Array<
          Record<string, unknown> & {
            id: number;
            title: string;
            type: string;
          }
        >;
      };

      const target = search.items.find(
        ({ title, type }) =>
          type.startsWith("issue") &&
          title.includes(AUTHENTICATION_SUBJECT),
      );

      expect(target).toBeDefined();

      for (const item of search.items) {
        expect(item).not.toHaveProperty("journals");
        expect(item).not.toHaveProperty("relations");
        expect(item).not.toHaveProperty("attachments");
        expect(item).not.toHaveProperty("allowed_statuses");
        expect(item).not.toHaveProperty("custom_fields");
      }

      if (!target) {
        throw new Error(
          "Representative issue was not found by redmine_search",
        );
      }

      const getResult = await harness.callTool(
        "redmine_get_issue",
        {
          issue_id: target.id,
        },
      );

      expect(getResult.isError).not.toBe(true);

      const detail = JSON.parse(
        requireTextContent(getResult.content),
      ) as Record<string, unknown> & {
        id: number;
        subject: string;
      };

      expect(detail.id).toBe(target.id);
      expect(detail.subject).toBe(AUTHENTICATION_SUBJECT);
      expect(detail).not.toHaveProperty("journals");
      expect(detail).not.toHaveProperty("relations");
      expect(detail).not.toHaveProperty("children");
      expect(detail).not.toHaveProperty("attachments");
      expect(detail).not.toHaveProperty("allowed_statuses");
    } finally {
      await harness.close();
    }
  });
});
