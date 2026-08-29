import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertContextReportContainsNoSecrets,
  compareContextMeasurements,
  formatContextComparison,
} from "../helpers/context-comparison.js";
import {
  createContextBaseline,
  measureContext,
  type ContextMeasurement,
} from "../helpers/context-measurement.js";
import {
  AUTHENTICATION_FIXTURE_SUBJECT,
  JOURNAL_FIXTURE_SUBJECT,
  PRIMARY_TEST_PROJECT_IDENTIFIER,
} from "../helpers/redmine-fixtures.js";
import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_CONTEXT_SCENARIOS = [
  "tools/list",
  "redmine_get_current_user",
  "redmine_list_issues_default",
  "redmine_search_default",
  "redmine_get_issue_core",
  "redmine_get_issue_plus_journals",
  "redmine_get_issue_plus_allowed_statuses",
  "redmine_get_project_stable_envelope",
] as const;

const CONTEXT_BASELINE_PATH = resolve(
  "tests/e2e/context-baseline.json",
);

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

async function processBaseline(
  measurements: ContextMeasurement[],
  secrets: string[],
): Promise<void> {
  const baseline = createContextBaseline(measurements);
  const serialized = `${JSON.stringify(baseline, null, 2)}\n`;

  assertContextReportContainsNoSecrets(serialized, secrets);

  if (process.env.UPDATE_CONTEXT_BASELINE === "1") {
    await writeFile(
      CONTEXT_BASELINE_PATH,
      serialized,
      "utf8",
    );
    console.info(
      `Context baseline updated: ${CONTEXT_BASELINE_PATH}`,
    );
    return;
  }

  if (process.env.COMPARE_CONTEXT_BASELINE === "1") {
    let baselineJson: unknown;

    try {
      baselineJson = JSON.parse(
        await readFile(CONTEXT_BASELINE_PATH, "utf8"),
      ) as unknown;
    } catch (error) {
      throw new Error(
        "Context baseline could not be read; run npm run context:baseline:update",
        { cause: error },
      );
    }

    const comparison = compareContextMeasurements(
      baselineJson,
      measurements,
    );
    const report = formatContextComparison(comparison);

    assertContextReportContainsNoSecrets(report, secrets);
    console.info(report);

    expect(
      comparison.requires_baseline_update,
      `${report}\nRun npm run context:baseline:update after reviewing the scenario changes.`,
    ).toBe(false);
    expect(comparison.has_regressions, report).toBe(false);
    return;
  }

  console.info(
    "Current context measurement:\n" + serialized,
  );
}

describe("MCP context measurement baseline", () => {
  it("measures the complete deterministic read-only scenario set", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-context-measurement-e2e-client",
      env: {
        REDMINE_WRITE_ENABLED: "false",
      },
    });

    try {
      const measurements: ContextMeasurement[] = [];

      const toolsResult = await harness.listTools();

      measurements.push(
        measureContext(
          "tools/list",
          toolsResult,
          toolsResult.tools.length,
        ),
      );

      const currentUserResult = await harness.callTool(
        "redmine_get_current_user",
      );

      expect(currentUserResult.isError).not.toBe(true);
      expectStructuredMatchesText(currentUserResult);

      measurements.push(
        measureContext(
          "redmine_get_current_user",
          currentUserResult,
          1,
        ),
      );

      const issueListResult = await harness.callTool(
        "redmine_list_issues",
        {
          project_id: PRIMARY_TEST_PROJECT_IDENTIFIER,
        },
      );

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
          subject === AUTHENTICATION_FIXTURE_SUBJECT,
      );

      expect(targetIssue).toBeDefined();

      if (!targetIssue) {
        throw new Error(
          "Representative issue was not found",
        );
      }

      const searchResult = await harness.callTool(
        "redmine_search",
        {
          query: "authentication",
        },
      );

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

      const coreIssueResult = await harness.callTool(
        "redmine_get_issue",
        {
          issue_id: targetIssue.id,
        },
      );

      expect(coreIssueResult.isError).not.toBe(true);
      expectStructuredMatchesText(coreIssueResult);

      const coreIssueMeasurement = measureContext(
        "redmine_get_issue_core",
        coreIssueResult,
        1,
      );

      measurements.push(coreIssueMeasurement);

      const journalListResult = await harness.callTool(
        "redmine_list_issues",
        {
          project_id: PRIMARY_TEST_PROJECT_IDENTIFIER,
          subject: JOURNAL_FIXTURE_SUBJECT,
        },
      );

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

      const journalCoreResult = await harness.callTool(
        "redmine_get_issue",
        {
          issue_id: journalTarget.id,
        },
      );

      expect(
        journalCoreResult.isError,
      ).not.toBe(true);
      expectStructuredMatchesText(journalCoreResult);

      const journalDetailResult = await harness.callTool(
        "redmine_get_issue",
        {
          issue_id: journalTarget.id,
          include: ["journals"],
        },
      );

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

      measurements.push(journalDetailMeasurement);

      expect(
        journalDetailMeasurement.total.bytes,
      ).toBeGreaterThan(
        journalCoreMeasurement.total.bytes,
      );

      const allowedStatusesResult =
        await harness.callTool(
          "redmine_get_issue",
          {
            issue_id: targetIssue.id,
            include: ["allowed_statuses"],
          },
        );

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
        await harness.callTool(
          "redmine_list_projects",
          {
            limit: 25,
          },
        );

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
            identifier === PRIMARY_TEST_PROJECT_IDENTIFIER,
        );

      expect(targetProject).toBeDefined();

      if (!targetProject) {
        throw new Error(
          "MCP Test Project was not found",
        );
      }

      const projectResult =
        await harness.callTool(
          "redmine_get_project",
          {
            project_id:
              targetProject.identifier,
          },
        );

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
          measurement.total.bytes,
        ).toBeGreaterThan(0);
        expect(
          measurement.total.characters,
        ).toBeGreaterThan(0);
        expect(
          measurement.total.estimated_tokens,
        ).toBeGreaterThan(0);
        expect(
          measurement.items,
        ).toBeGreaterThanOrEqual(0);
      }

      for (const measurement of measurements.slice(1)) {
        expect(
          measurement.content_text.bytes,
        ).toBeGreaterThan(0);
        expect(
          measurement.structured_content.bytes,
        ).toBeGreaterThan(0);
      }

      await processBaseline(
        measurements,
        [
          harness.redmineApiKey,
          process.env.REDMINE_WRITE_API_KEY,
        ].filter((value): value is string => Boolean(value)),
      );
    } finally {
      await harness.close();
    }
  });
});
