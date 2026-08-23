import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toToolErrorResult } from "../errors.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineIssueSummary,
  RedmineListIssuesParams,
  RedminePaginatedResponse,
} from "../../redmine/types.js";

const issueFilterIdSchema = z.union([
  z.string().min(1),
  z.number().int().positive(),
]);

export const getIssueInputSchema = z.object({
  issue_id: z.number().int().positive(),
});

export const listIssuesInputSchema = z.object({
  project_id: issueFilterIdSchema.optional(),
  tracker_id: issueFilterIdSchema.optional(),
  status_id: issueFilterIdSchema.optional(),
  assigned_to_id: issueFilterIdSchema.optional(),
  fixed_version_id: issueFilterIdSchema.optional(),
  subject: z.string().trim().min(1).optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(20).optional(),
  sort: z.string().min(1).optional(),
});

export type GetIssueInput = z.infer<typeof getIssueInputSchema>;
export type ListIssuesInput = z.infer<typeof listIssuesInputSchema>;

export interface IssueToolClient {
  getIssue(
    issueId: number,
    options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue>;

  listIssues(
    params?: RedmineListIssuesParams,
  ): Promise<RedminePaginatedResponse<RedmineIssueSummary>>;
}

const ISSUE_DETAIL_INCLUDE = ["journals", "relations"] as const satisfies readonly RedmineIssueInclude[];

export async function callGetIssueTool(
  redmineClient: IssueToolClient,
  input: GetIssueInput,
) {
  try {
    const issue = await redmineClient.getIssue(input.issue_id, {
      include: ISSUE_DETAIL_INCLUDE,
    });

    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(issue),
        },
      ],
    };
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export async function callListIssuesTool(
  redmineClient: IssueToolClient,
  input: ListIssuesInput,
) {
  try {
    const issues = await redmineClient.listIssues({
      projectId: input.project_id,
      trackerId: input.tracker_id,
      statusId: input.status_id,
      assignedToId: input.assigned_to_id,
      fixedVersionId: input.fixed_version_id,
      subject: input.subject,
      offset: input.offset,
      limit: input.limit ?? 10,
      sort: input.sort,
    });

    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(issues),
        },
      ],
    };
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export function registerIssueTools(
  server: McpServer,
  redmineClient: IssueToolClient,
): void {
  server.registerTool(
    "redmine_get_issue",
    {
      description:
        "Retrieve detailed information for a Redmine issue when its numeric " +
        "issue ID is already known. The response includes journals and issue " +
        "relations when available. Use redmine_search for free-text discovery " +
        "when the issue ID is unknown.",
      inputSchema: getIssueInputSchema,
    },
    (input) => callGetIssueTool(redmineClient, input),
  );

  server.registerTool(
    "redmine_list_issues",
    {
      description:
        "List Redmine issues using structured filters and pagination. Use " +
        "this tool when project, tracker, status, assignee, version, subject, " +
        "or sort filters are known. Subject matching is substring-based. " +
        "The default limit is 10 and the maximum is 20. This tool returns " +
        "bounded summaries; use redmine_get_issue for details.",
      inputSchema: listIssuesInputSchema,
    },
    (input) => callListIssuesTool(redmineClient, input),
  );
}
