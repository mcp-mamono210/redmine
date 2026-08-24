import { describe, expect, it } from "vitest";

import {
  measureContext,
  type ContextMeasurement,
} from "../helpers/context-measurement.js";
import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_CONTEXT_SCENARIOS = [
  "tools/list",
  "redmine_list_issues_default",
  "redmine_search_default",
  "redmine_get_issue_core",
  "redmine_get_issue_journal_fixture_core",
  "redmine_get_issue_plus_journals",
  "redmine_get_issue_plus_allowed_statuses",
  "redmine_get_project_stable_envelope",
] as const;

interface IssueSummary {
  id: number;
  subject: string;
}

interface IssueListResponse {
  items: IssueSummary[];
  limit: number;
}

interface SearchResponse {
  items: unknown[];
  limit: number;
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
    throw new Error(
      "Tool result did not contain structuredContent",
    );
  }

  return structuredContent as Record<string, unknown>;
}

function parseToolJson<T>(
  content: Parameters<typeof requireTextContent>[0],
): T {
  return JSON.parse(requireTextContent(content)) as T;
}

function expectStructuredMatchesText(result: {
  content: Parameters<typeof requireTextContent>[0];
  structuredContent?: unknown;
}): void {
  const text = requireTextContent(result.content);
  const structured = requireStructuredContent(result);

  expect(structured).toEqual(
    JSON.parse(text) as Record<string, unknown>,
  );
}

function printBaseline(
  measurements: ContextMeasurement[],
): void {
  console.info(
    "Context measurement baseline:\n" +
      JSON.stringify(measurements, null, 2),
  );
}

describe("MCP context measurement baseline", () => {
  it("measures the complete deterministic read-only scenario set", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-context-measurement-e2e-client",
    );

    try {
      const measurements: ContextMeasurement[] = [];

      const toolsResult = await client.listTools();

      measurements.push(
        measureContext(
          "tools/list",
          toolsResult,
          toolsResult.tools.length,
        ),
      );

      const issueListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
        },
      });

      expect(issueListResult.isError).not.toBe(true);
      expectStructuredMatchesText(issueListResult);

      const issueList =
        parseToolJson<IssueListResponse>(
          issueListResult.content,
        );

      expect(issueList.limit).toBe(10);

      measurements.push(
        measureContext(
          "redmine_list_issues_default",
          issueListResult,
          issueList.items.length,
        ),
      );

      const targetIssue = issueList.items.find(
        ({ subject }) =>
          subject ===
          "Authentication fails for invalid API token",
      );

      expect(targetIssue).toBeDefined();

      if (!targetIssue) {
        throw new Error(
          "Representative issue was not found",
        );
      }

      const searchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
        },
      });

      expect(searchResult.isError).not.toBe(true);
      expectStructuredMatchesText(searchResult);

      const search = parseToolJson<SearchResponse>(
        searchResult.content,
      );

      expect(search.limit).toBe(10);

      measurements.push(
        measureContext(
          "redmine_search_default",
          searchResult,
          search.items.length,
        ),
      );

      const coreIssueResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: targetIssue.id,
        },
      });

      expect(coreIssueResult.isError).not.toBe(true);
      expectStructuredMatchesText(coreIssueResult);

      const coreIssueMeasurement = measureContext(
        "redmine_get_issue_core",
        coreIssueResult,
        1,
      );

      measurements.push(coreIssueMeasurement);

      const journalListResult = await client.callTool({
        name: "redmine_list_issues",
        arguments: {
          project_id: "mcp-test",
          subject: "Add issue listing support",
        },
      });

      expect(journalListResult.isError).not.toBe(true);
      expectStructuredMatchesText(journalListResult);

      const journalList =
        parseToolJson<IssueListResponse>(
          journalListResult.content,
        );
      const journalTarget = journalList.items[0];

      expect(journalTarget).toBeDefined();

      if (!journalTarget) {
        throw new Error(
          "Journal fixture issue was not found",
        );
      }

      const journalCoreResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
        },
      });

      expect(
        journalCoreResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(journalCoreResult);

      const journalDetailResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: journalTarget.id,
          include: ["journals"],
        },
      });

      expect(
        journalDetailResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(journalDetailResult);

      const journalCoreMeasurement = measureContext(
        "redmine_get_issue_journal_fixture_core",
        journalCoreResult,
        1,
      );
      const journalDetailMeasurement =
        measureContext(
          "redmine_get_issue_plus_journals",
          journalDetailResult,
          1,
        );

      measurements.push(
        journalCoreMeasurement,
        journalDetailMeasurement,
      );

      expect(
        journalDetailMeasurement.bytes,
      ).toBeGreaterThan(
        journalCoreMeasurement.bytes,
      );

      const allowedStatusesResult =
        await client.callTool({
          name: "redmine_get_issue",
          arguments: {
            issue_id: targetIssue.id,
            include: ["allowed_statuses"],
          },
        });

      expect(
        allowedStatusesResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(
        allowedStatusesResult,
      );

      measurements.push(
        measureContext(
          "redmine_get_issue_plus_allowed_statuses",
          allowedStatusesResult,
          1,
        ),
      );

      const projectListResult =
        await client.callTool({
          name: "redmine_list_projects",
          arguments: {
            limit: 25,
          },
        });

      expect(
        projectListResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(projectListResult);

      const projectList =
        parseToolJson<ProjectListResponse>(
          projectListResult.content,
        );

      const targetProject =
        projectList.items.find(
          ({ identifier }) =>
            identifier === "mcp-test",
        );

      expect(targetProject).toBeDefined();

      if (!targetProject) {
        throw new Error(
          "MCP Test Project was not found",
        );
      }

      const projectResult =
        await client.callTool({
          name: "redmine_get_project",
          arguments: {
            project_id:
              targetProject.identifier,
          },
        });

      expect(
        projectResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(projectResult);

      measurements.push(
        measureContext(
          "redmine_get_project_stable_envelope",
          projectResult,
          1,
        ),
      );

      expect(
        measurements.map(
          ({ scenario }) => scenario,
        ),
      ).toEqual([
        ...EXPECTED_CONTEXT_SCENARIOS,
      ]);

      for (const measurement of measurements) {
        expect(
          measurement.bytes,
        ).toBeGreaterThan(0);
        expect(
          measurement.items,
        ).toBeGreaterThanOrEqual(0);
      }

      printBaseline(measurements);
    } finally {
      await client.close();
    }
  });
});
