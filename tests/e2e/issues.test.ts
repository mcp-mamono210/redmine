import { describe, expect, it } from "vitest";

import { connectE2eClient, requireTextContent } from "./helpers.js";

describe("Issue read-only MCP E2E", () => {
  it("returns bounded summaries and a core-only get_issue response by default", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issues-e2e-client",
    );

    try {
      const listResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: "invalid API",
        },
      });

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(
        requireTextContent(listResult.content),
      ) as {
        items: Array<
          Record<string, unknown> & {
            id: number;
            subject: string;
          }
        >;
        limit: number;
      };

      expect(list.limit).toBe(10);
      expect(list.items.length).toBeGreaterThan(0);

      const target = list.items.find(
        ({ subject }) =>
          subject ===
          "Authentication fails for invalid API token",
      );

      expect(target).toBeDefined();

      for (const item of list.items) {
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("journals");
        expect(item).not.toHaveProperty("relations");
        expect(item).not.toHaveProperty("customFields");
        expect(item).not.toHaveProperty("author");
      }

      if (!target) {
        throw new Error("Representative issue was not found");
      }

      const getResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: target.id,
        },
      });

      expect(getResult.isError).not.toBe(true);

      const detail = JSON.parse(
        requireTextContent(getResult.content),
      ) as Record<string, unknown>;

      expect(detail).toHaveProperty("description");
      expect(detail).not.toHaveProperty("journals");
      expect(detail).not.toHaveProperty("relations");
      expect(detail).not.toHaveProperty("children");
      expect(detail).not.toHaveProperty("attachments");
      expect(detail).not.toHaveProperty("allowedStatuses");
    } finally {
      await client.close();
    }
  });

  it("returns only explicitly requested optional issue associations", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issue-includes-e2e-client",
    );

    try {
      const journalListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: "Add issue listing support",
        },
      });

      expect(journalListResult.isError).not.toBe(true);

      const journalList = JSON.parse(
        requireTextContent(journalListResult.content),
      ) as {
        items: Array<{ id: number; subject: string }>;
      };
      const journalTarget = journalList.items[0];

      expect(journalTarget).toBeDefined();

      if (!journalTarget) {
        throw new Error("Journal fixture issue was not found");
      }

      const journalResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: [
            "journals",
            "attachments",
            "allowed_statuses",
          ],
        },
      });

      expect(journalResult.isError).not.toBe(true);

      const journalDetail = JSON.parse(
        requireTextContent(journalResult.content),
      ) as {
        journals?: Array<{ notes: string }>;
        attachments?: unknown[];
        allowedStatuses?: unknown[];
        relations?: unknown[];
      };

      expect(
        journalDetail.journals?.some(
          ({ notes }) =>
            notes === "Initial investigation completed.",
        ),
      ).toBe(true);
      expect(journalDetail.attachments).toEqual([]);
      expect(Array.isArray(journalDetail.allowedStatuses)).toBe(true);
      expect(journalDetail).not.toHaveProperty("relations");

      const relationListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: "Authentication fails",
        },
      });

      expect(relationListResult.isError).not.toBe(true);

      const relationList = JSON.parse(
        requireTextContent(relationListResult.content),
      ) as {
        items: Array<{ id: number }>;
      };
      const relationTarget = relationList.items[0];

      expect(relationTarget).toBeDefined();

      if (!relationTarget) {
        throw new Error("Relation fixture issue was not found");
      }

      const relationResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: relationTarget.id,
          include: ["relations"],
        },
      });

      expect(relationResult.isError).not.toBe(true);

      const relationDetail = JSON.parse(
        requireTextContent(relationResult.content),
      ) as {
        relations?: unknown[];
      };

      expect(relationDetail.relations?.length).toBeGreaterThan(0);
      expect(relationDetail).not.toHaveProperty("journals");
    } finally {
      await client.close();
    }
  });

  it("rejects unsupported get_issue include values at the MCP schema boundary", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issue-include-validation-e2e-client",
    );

    try {
      const invalidResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: 1,
          include: ["watchers"],
        },
      });

      expect(invalidResult.isError).toBe(true);

      const invalidText = requireTextContent(
        invalidResult.content,
      );

      expect(invalidText).toContain("Input validation error");
    } finally {
      await client.close();
    }
  });

  it("rejects list limits above 20 at the MCP schema boundary", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issues-limit-e2e-client",
    );

    try {
      const invalidResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          limit: 21,
        },
      });

      expect(invalidResult.isError).toBe(true);

      const invalidText = requireTextContent(
        invalidResult.content,
      );

      expect(invalidText).toContain("Input validation error");
      expect(invalidText).toContain(
        "expected number to be <=20",
      );
    } finally {
      await client.close();
    }
  });
});
