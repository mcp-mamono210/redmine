import { describe, expect, it } from "vitest";

import {
  measureContext,
  type ContextMeasurement,
} from "../helpers/context-measurement.js";
import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

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

function parseToolJson<T>(content: Parameters<typeof requireTextContent>[0]): T {
  return JSON.parse(requireTextContent(content)) as T;
}

function printBaseline(measurements: ContextMeasurement[]): void {
  console.info(
    "Context measurement baseline:\n" +
      JSON.stringify(measurements, null, 2),
  );
}

describe("MCP context measurement baseline", () => {
  it("measures deterministic read-only MCP responses", async () => {
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

      const issueList = parseToolJson<IssueListResponse>(
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
          subject === "Authentication fails for invalid API token",
      );

      expect(targetIssue).toBeDefined();

      if (!targetIssue) {
        throw new Error("Representative issue was not found");
      }

      const searchResult = await client.callTool({
        name: "redmine_search",
        arguments: {
          query: "authentication",
        },
      });

      expect(searchResult.isError).not.toBe(true);

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

      const issueResult = await client.callTool({
        name: "redmine_get_issue",
        arguments: {
          issue_id: targetIssue.id,
        },
      });

      expect(issueResult.isError).not.toBe(true);

      measurements.push(
        measureContext(
          "redmine_get_issue_current",
          issueResult,
          1,
        ),
      );

      const projectListResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 25,
        },
      });

      expect(projectListResult.isError).not.toBe(true);

      const projectList = parseToolJson<ProjectListResponse>(
        projectListResult.content,
      );

      const targetProject = projectList.items.find(
        ({ identifier }) => identifier === "mcp-test",
      );

      expect(targetProject).toBeDefined();

      if (!targetProject) {
        throw new Error("MCP Test Project was not found");
      }

      const projectResult = await client.callTool({
        name: "redmine_get_project",
        arguments: {
          project_id: targetProject.identifier,
        },
      });

      expect(projectResult.isError).not.toBe(true);

      measurements.push(
        measureContext(
          "redmine_get_project_current",
          projectResult,
          1,
        ),
      );

      for (const measurement of measurements) {
        expect(measurement.bytes).toBeGreaterThan(0);
        expect(measurement.items).toBeGreaterThanOrEqual(0);
      }

      printBaseline(measurements);
    } finally {
      await client.close();
    }
  });
});
