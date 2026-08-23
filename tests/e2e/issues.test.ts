import { describe, expect, it } from "vitest";

import { connectE2eClient, requireTextContent } from "./helpers.js";

const AUTHENTICATION_SUBJECT =
  "Authentication fails for invalid API token";
const JOURNAL_SUBJECT = "Add issue listing support";
const JOURNAL_NOTE = "Initial investigation completed.";

function expectOptionalAssociationsAbsent(
  detail: Record<string, unknown>,
  except: readonly string[] = [],
): void {
  const exceptSet = new Set(except);

  for (const property of [
    "journals",
    "relations",
    "children",
    "attachments",
    "allowed_statuses",
  ]) {
    if (!exceptSet.has(property)) {
      expect(detail).not.toHaveProperty(property);
    }
  }
}

function expectNoCamelCaseIssueKeys(
  detail: Record<string, unknown>,
): void {
  for (const property of [
    "assignedTo",
    "fixedVersion",
    "customFields",
    "createdOn",
    "updatedOn",
    "allowedStatuses",
  ]) {
    expect(detail).not.toHaveProperty(property);
  }
}

describe("Issue read-only MCP E2E", () => {
  it("keeps subject matching partial, list responses summarized, and get_issue core-only by default", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issues-core-e2e-client",
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
      };

      const target = list.items.find(
        ({ subject }) => subject === AUTHENTICATION_SUBJECT,
      );

      expect(target).toBeDefined();

      for (const item of list.items) {
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("journals");
        expect(item).not.toHaveProperty("relations");
        expect(item).not.toHaveProperty("children");
        expect(item).not.toHaveProperty("attachments");
        expect(item).not.toHaveProperty("allowed_statuses");
        expect(item).not.toHaveProperty("custom_fields");
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

      expect(detail.id).toBe(target.id);
      expect(detail.subject).toBe(AUTHENTICATION_SUBJECT);
      expect(detail).toHaveProperty("description");
      expectOptionalAssociationsAbsent(detail);
      expectNoCamelCaseIssueKeys(detail);
    } finally {
      await client.close();
    }
  });

  it("returns only the explicitly requested optional issue association", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issue-single-includes-e2e-client",
    );

    try {
      const journalListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: JOURNAL_SUBJECT,
        },
      });

      expect(journalListResult.isError).not.toBe(true);

      const journalList = JSON.parse(
        requireTextContent(journalListResult.content),
      ) as {
        items: Array<{ id: number; subject: string }>;
      };

      const journalTarget = journalList.items.find(
        ({ subject }) => subject === JOURNAL_SUBJECT,
      );

      expect(journalTarget).toBeDefined();

      if (!journalTarget) {
        throw new Error("Journal fixture issue was not found");
      }

      const journalsResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: ["journals"],
        },
      });

      expect(journalsResult.isError).not.toBe(true);

      const journalsDetail = JSON.parse(
        requireTextContent(journalsResult.content),
      ) as Record<string, unknown> & {
        journals?: Array<{ notes: string }>;
      };

      expect(
        journalsDetail.journals?.some(
          ({ notes }) => notes === JOURNAL_NOTE,
        ),
      ).toBe(true);
      expectOptionalAssociationsAbsent(journalsDetail, ["journals"]);

      const attachmentsResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: ["attachments"],
        },
      });

      expect(attachmentsResult.isError).not.toBe(true);

      const attachmentsDetail = JSON.parse(
        requireTextContent(attachmentsResult.content),
      ) as Record<string, unknown> & {
        attachments?: unknown[];
      };

      expect(attachmentsDetail.attachments).toEqual([]);
      expectOptionalAssociationsAbsent(
        attachmentsDetail,
        ["attachments"],
      );

      const childrenResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: ["children"],
        },
      });

      expect(childrenResult.isError).not.toBe(true);

      const childrenDetail = JSON.parse(
        requireTextContent(childrenResult.content),
      ) as Record<string, unknown> & {
        children?: unknown[];
      };

      // Redmine 6.1.x may omit the `children` property entirely when
      // include=children is requested but the issue has no children.
      // Both an omitted property and an explicit empty array represent
      // "no child issues" at this read-only boundary.
      expect(childrenDetail.children ?? []).toEqual([]);
      expectOptionalAssociationsAbsent(childrenDetail, ["children"]);

      const allowedStatusesResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: ["allowed_statuses"],
        },
      });

      expect(allowedStatusesResult.isError).not.toBe(true);

      const allowedStatusesDetail = JSON.parse(
        requireTextContent(allowedStatusesResult.content),
      ) as Record<string, unknown> & {
        allowed_statuses?: Array<{ id: number; name: string }>;
      };

      // The deterministic MCP Read Only role has no edit_issues permission,
      // so Redmine must not expose writable status transitions.
      expect(allowedStatusesDetail.allowed_statuses).toEqual([]);
      expectOptionalAssociationsAbsent(
        allowedStatusesDetail,
        ["allowed_statuses"],
      );
      expectNoCamelCaseIssueKeys(allowedStatusesDetail);

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
        items: Array<{ id: number; subject: string }>;
      };

      const relationTarget = relationList.items.find(
        ({ subject }) => subject === AUTHENTICATION_SUBJECT,
      );

      expect(relationTarget).toBeDefined();

      if (!relationTarget) {
        throw new Error("Relation fixture issue was not found");
      }

      const relationsResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: relationTarget.id,
          include: ["relations"],
        },
      });

      expect(relationsResult.isError).not.toBe(true);

      const relationsDetail = JSON.parse(
        requireTextContent(relationsResult.content),
      ) as Record<string, unknown> & {
        relations?: unknown[];
      };

      expect(relationsDetail.relations?.length).toBeGreaterThan(0);
      expectOptionalAssociationsAbsent(relationsDetail, ["relations"]);
      expectNoCamelCaseIssueKeys(relationsDetail);
    } finally {
      await client.close();
    }
  });

  it("supports multiple explicit includes without adding unrequested associations", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-issue-multiple-includes-e2e-client",
    );

    try {
      const listResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: JOURNAL_SUBJECT,
        },
      });

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(
        requireTextContent(listResult.content),
      ) as {
        items: Array<{ id: number; subject: string }>;
      };

      const target = list.items.find(
        ({ subject }) => subject === JOURNAL_SUBJECT,
      );

      expect(target).toBeDefined();

      if (!target) {
        throw new Error("Journal fixture issue was not found");
      }

      const result = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: target.id,
          include: ["journals", "allowed_statuses"],
        },
      });

      expect(result.isError).not.toBe(true);

      const detail = JSON.parse(
        requireTextContent(result.content),
      ) as Record<string, unknown> & {
        journals?: Array<{ notes: string }>;
        allowed_statuses?: Array<{ id: number; name: string }>;
      };

      expect(
        detail.journals?.some(
          ({ notes }) => notes === JOURNAL_NOTE,
        ),
      ).toBe(true);
      // Multiple include values must preserve the same read-only
      // allowed_statuses semantics.
      expect(detail.allowed_statuses).toEqual([]);
      expectOptionalAssociationsAbsent(detail, [
        "journals",
        "allowed_statuses",
      ]);
      expectNoCamelCaseIssueKeys(detail);
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
});
