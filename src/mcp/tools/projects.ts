import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toToolErrorResult } from "../errors.js";
import {
  getProjectOutputSchema,
  listProjectsOutputSchema,
} from "../output-schemas.js";
import { createPublicMcpSuccessResult } from "../serialize.js";
import type {
  RedmineIssueCustomFieldMetadata,
  RedmineListMembershipsParams,
  RedmineListProjectsParams,
  RedmineMembership,
  RedmineNamedResource,
  RedminePaginatedResponse,
  RedmineProject,
  RedmineProjectInclude,
  RedmineProjectSummary,
  RedmineVersion,
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

  listProjectVersions(
    projectId: string | number,
  ): Promise<RedmineVersion[]>;

  listProjectMemberships(
    projectId: string | number,
    params?: RedmineListMembershipsParams,
  ): Promise<RedminePaginatedResponse<RedmineMembership>>;

  listIssuePriorities(): Promise<RedmineNamedResource[]>;
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

interface ProjectVersionResponse {
  id: number;
  name: string;
  description?: string;
  status: string;
  due_date?: string;
  sharing?: string;
}

interface ProjectMemberResponse {
  id: number;
  user?: RedmineNamedResource;
  group?: RedmineNamedResource;
  roles: Array<
    RedmineNamedResource & {
      inherited?: boolean;
    }
  >;
}

interface ProjectStableEnvelope {
  project: ProjectCoreResponse;
  trackers: RedmineNamedResource[];
  categories: RedmineNamedResource[];
  custom_fields: ProjectCustomFieldResponse[];
  versions: ProjectVersionResponse[] | null;
  members: ProjectMemberResponse[] | null;
  priorities: RedmineNamedResource[] | null;
  warnings: string[];
}

const PROJECT_DETAIL_INCLUDE = [
  "trackers",
  "issue_categories",
  "issue_custom_fields",
] as const satisfies readonly RedmineProjectInclude[];

const MEMBERSHIP_LIMIT = 100;

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

function toVersionResponse(version: RedmineVersion): ProjectVersionResponse {
  return {
    id: version.id,
    name: version.name,
    ...(version.description !== undefined
      ? { description: version.description }
      : {}),
    status: version.status,
    ...(version.dueDate !== undefined
      ? { due_date: version.dueDate }
      : {}),
    ...(version.sharing !== undefined
      ? { sharing: version.sharing }
      : {}),
  };
}

function toMemberResponse(member: RedmineMembership): ProjectMemberResponse {
  return {
    id: member.id,
    ...(member.user !== undefined ? { user: member.user } : {}),
    ...(member.group !== undefined ? { group: member.group } : {}),
    roles: member.roles.map((role) => ({
      id: role.id,
      name: role.name,
      ...(role.inherited !== undefined
        ? { inherited: role.inherited }
        : {}),
    })),
  };
}

function baseStableEnvelope(
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
    const envelope = baseStableEnvelope(project);

    const [versionsResult, membershipsResult, prioritiesResult] =
      await Promise.allSettled([
        redmineClient.listProjectVersions(input.project_id),
        redmineClient.listProjectMemberships(input.project_id, {
          limit: MEMBERSHIP_LIMIT,
        }),
        redmineClient.listIssuePriorities(),
      ]);

    if (versionsResult.status === "fulfilled") {
      envelope.versions = versionsResult.value.map(toVersionResponse);
    } else {
      envelope.warnings.push("versions: unavailable");
    }

    if (membershipsResult.status === "fulfilled") {
      envelope.members = membershipsResult.value.items.map(toMemberResponse);

      if (
        membershipsResult.value.totalCount >
        membershipsResult.value.items.length
      ) {
        envelope.warnings.push(
          `members: truncated to ${membershipsResult.value.items.length} of ${membershipsResult.value.totalCount}`,
        );
      }
    } else {
      envelope.warnings.push("members: unavailable");
    }

    if (prioritiesResult.status === "fulfilled") {
      envelope.priorities = prioritiesResult.value;
    } else {
      envelope.warnings.push("priorities: unavailable");
    }

    return createPublicMcpSuccessResult(envelope);
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

    return createPublicMcpSuccessResult(projects);
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
      outputSchema: getProjectOutputSchema,
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
      outputSchema: listProjectsOutputSchema,
    },
    (input) => callListProjectsTool(redmineClient, input),
  );
}
