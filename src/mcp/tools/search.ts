import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toToolErrorResult } from "../errors.js";
import type {
  RedminePaginatedResponse,
  RedmineSearchParams,
  RedmineSearchResult,
} from "../../redmine/types.js";

const projectIdSchema = z.union([
  z.string().min(1),
  z.number().int().positive(),
]);

export const searchInputSchema = z.object({
  query: z.string().trim().min(1),
  project_id: projectIdSchema.optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(20).optional(),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export interface SearchToolClient {
  search(
    params: RedmineSearchParams,
  ): Promise<RedminePaginatedResponse<RedmineSearchResult>>;
}

export async function callSearchTool(
  redmineClient: SearchToolClient,
  input: SearchInput,
) {
  try {
    const result = await redmineClient.search({
      query: input.query.trim(),
      projectId: input.project_id,
      offset: input.offset,
      limit: input.limit ?? 10,
    });

    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export function registerSearchTool(
  server: McpServer,
  redmineClient: SearchToolClient,
): void {
  server.registerTool(
    "redmine_search",
    {
      description:
        "Search Redmine by free text to discover resources. Use project_id " +
        "to scope the search to one project, or omit it for a global search. " +
        "The default limit is 10 and the maximum is 20. Search results are " +
        "summaries; when an issue ID is found, use redmine_get_issue to " +
        "retrieve complete issue details. Use redmine_list_issues instead " +
        "when structured issue filters are known.",
      inputSchema: searchInputSchema,
    },
    (input) => callSearchTool(redmineClient, input),
  );
}
