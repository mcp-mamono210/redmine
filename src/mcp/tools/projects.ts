import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toToolErrorResult } from "../errors.js";
import { stringifyPublicMcpJson } from "../serialize.js";
import type {
  RedmineIssueCustomFieldMetadata,
  RedmineListProjectsParams,
  RedmineNamedResource,
  RedminePaginatedResponse,
  RedmineProject,
  RedmineProjectInclude,
  RedmineProjectSummary,
} from "../../redmine/types.js";

const projectIdSchema = z.union([
  z.string().min(1),
  z.number().int().positive(),
]);

export const getProjectInputSchema = z.object({
  project_id: projectIdSchema,
});

export const listProjectsInputSchema = z.object({
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export type GetProjectInput = z.infer<typeof getProjectInputSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;

export interface ProjectToolClient {
  getProject(
    projectId: string | number,
    options?: { include?: readonly RedmineProjectInclude[] },
  ): Promise<RedmineProject>;

  listProjects(
    params?: RedmineListProjectsParams,
  ): Promise<RedminePaginatedResponse<RedmineProjectSummary>>;
}

interface ProjectCoreResponse {
  id: number;
  identifier: string;
  name: string;
  description?: string;
  status?: number;
  is_public?: boolean;
  parent?: RedmineNamedResource;
  created_on?: string;
  updated_on?: string;
}

interface ProjectCustomFieldResponse {
  id: number;
  name: string;
  field_format?: string;
  is_required?: boolean;
}

interface ProjectStableEnvelope {
  project: ProjectCoreResponse;
  trackers: RedmineNamedResource[];
  categories: RedmineNamedResource[];
  custom_fields: ProjectCustomFieldResponse[];
  versions: null;
  members: null;
  priorities: null;
  warnings: string[];
}

const PROJECT_DETAIL_INCLUDE = [
  "trackers",
  "issue_categories",
  "issue_custom_fields",
] as const satisfies readonly RedmineProjectInclude[];

function toProjectCore(project: RedmineProject): ProjectCoreResponse {
  return {
    id: project.id,
    identifier: project.identifier,
    name: project.name,
    ...(project.description !== undefined
      ? { description: project.description }
      : {}),
    ...(project.status !== undefined
      ? { status: project.status }
      : {}),
    ...(project.isPublic !== undefined
      ? { is_public: project.isPublic }
      : {}),
    ...(project.parent !== undefined
      ? { parent: project.parent }
      : {}),
    ...(project.createdOn !== undefined
      ? { created_on: project.createdOn }
      : {}),
    ...(project.updatedOn !== undefined
      ? { updated_on: project.updatedOn }
      : {}),
  };
}

function toCustomFieldResponse(
  field: RedmineIssueCustomFieldMetadata,
): ProjectCustomFieldResponse {
  return {
    id: field.id,
    name: field.name,
    ...(field.fieldFormat !== undefined
      ? { field_format: field.fieldFormat }
      : {}),
    ...(field.isRequired !== undefined
      ? { is_required: field.isRequired }
      : {}),
  };
}

function toStableEnvelope(
  project: RedmineProject,
): ProjectStableEnvelope {
  return {
    project: toProjectCore(project),
    trackers: project.trackers ?? [],
    categories: project.issueCategories ?? [],
    custom_fields:
      project.issueCustomFields?.map(toCustomFieldResponse) ?? [],
    versions: null,
    members: null,
    priorities: null,
    warnings: [],
  };
}

export async function callGetProjectTool(
  redmineClient: ProjectToolClient,
  input: GetProjectInput,
) {
  try {
    const project = await redmineClient.getProject(input.project_id, {
      include: PROJECT_DETAIL_INCLUDE,
    });
    const envelope = toStableEnvelope(project);

    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: stringifyPublicMcpJson(envelope),
        },
      ],
    };
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export async function callListProjectsTool(
  redmineClient: ProjectToolClient,
  input: ListProjectsInput,
) {
  try {
    const projects = await redmineClient.listProjects({
      offset: input.offset,
      limit: input.limit,
    });

    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: stringifyPublicMcpJson(projects),
        },
      ],
    };
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export function registerProjectTools(
  server: McpServer,
  redmineClient: ProjectToolClient,
): void {
  server.registerTool(
    "redmine_get_project",
    {
      description:
        "Retrieve detailed Redmine project metadata when the numeric project " +
        "ID or project identifier is already known. The response includes " +
        "trackers, issue categories, and issue custom field metadata when " +
        "available. Use redmine_list_projects to discover visible projects.",
      inputSchema: getProjectInputSchema,
    },
    (input) => callGetProjectTool(redmineClient, input),
  );

  server.registerTool(
    "redmine_list_projects",
    {
      description:
        "List Redmine projects visible to the configured Redmine user using " +
        "pagination. Use this tool to discover project IDs or identifiers, " +
        "then use redmine_get_project when detailed project metadata is needed.",
      inputSchema: listProjectsInputSchema,
    },
    (input) => callListProjectsTool(redmineClient, input),
  );
}
