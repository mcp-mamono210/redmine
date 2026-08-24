import { z } from "zod";

import {
  RedmineHttpError,
  RedmineNetworkError,
  RedmineResponseError,
} from "./errors.js";
import {
  currentUserResponseSchema,
  issuePrioritiesResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
  membershipsResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  searchResponseSchema,
  versionsResponseSchema,
  type RawIssue,
  type RawMembership,
  type RawProject,
  type RawSearchResult,
  type RawVersion,
} from "./schemas.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineIssueSummary,
  RedmineListIssuesParams,
  RedmineListMembershipsParams,
  RedmineListProjectsParams,
  RedmineMembership,
  RedmineNamedResource,
  RedminePaginatedResponse,
  RedmineProject,
  RedmineProjectInclude,
  RedmineProjectSummary,
  RedmineSearchParams,
  RedmineSearchResult,
  RedmineUser,
  RedmineVersion,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONTEXT_LIMIT = 10;

type QueryValue =
  | string
  | number
  | boolean
  | readonly string[]
  | undefined;

export interface RedmineClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function compactOptional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function normalizeIssueChild(
  child: NonNullable<RawIssue["children"]>[number],
): NonNullable<RedmineIssue["children"]>[number] {
  return {
    id: child.id,
    tracker: child.tracker,
    subject: child.subject,
    children: child.children?.map(normalizeIssueChild),
  };
}

function normalizeIssueDetail(raw: RawIssue): RedmineIssue {
  return {
    id: raw.id,
    project: raw.project,
    tracker: raw.tracker,
    status: {
      id: raw.status.id,
      name: raw.status.name,
      isClosed: raw.status.is_closed,
    },
    priority: raw.priority,
    author: raw.author,
    assignedTo: raw.assigned_to,
    fixedVersion: raw.fixed_version,
    subject: raw.subject,
    description: compactOptional(raw.description),
    startDate: compactOptional(raw.start_date),
    dueDate: compactOptional(raw.due_date),
    doneRatio: raw.done_ratio,
    isPrivate: raw.is_private,
    estimatedHours: compactOptional(raw.estimated_hours),
    customFields: raw.custom_fields.map((field) => ({
      id: field.id,
      name: field.name,
      value: field.value,
    })),
    createdOn: raw.created_on,
    updatedOn: raw.updated_on,
    closedOn: compactOptional(raw.closed_on),
    ...(raw.journals !== undefined
      ? {
          journals: raw.journals.map((journal) => ({
            id: journal.id,
            user: journal.user,
            notes: journal.notes,
            createdOn: journal.created_on,
            details: journal.details.map((detail) => ({
              property: detail.property,
              name: detail.name,
              oldValue: detail.old_value,
              newValue: detail.new_value,
            })),
          })),
        }
      : {}),
    ...(raw.relations !== undefined
      ? {
          relations: raw.relations.map((relation) => ({
            id: relation.id,
            issueId: relation.issue_id,
            issueToId: relation.issue_to_id,
            relationType: relation.relation_type,
            delay: compactOptional(relation.delay),
          })),
        }
      : {}),
    ...(raw.children !== undefined
      ? {
          children: raw.children.map(normalizeIssueChild),
        }
      : {}),
    ...(raw.attachments !== undefined
      ? {
          attachments: raw.attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            filesize: attachment.filesize,
            contentType: compactOptional(attachment.content_type),
            description: compactOptional(attachment.description),
            contentUrl: attachment.content_url,
            thumbnailUrl: attachment.thumbnail_url,
            author: attachment.author,
            createdOn: attachment.created_on,
          })),
        }
      : {}),
    ...(raw.allowed_statuses !== undefined
      ? {
          allowedStatuses: raw.allowed_statuses.map((status) => ({
            id: status.id,
            name: status.name,
          })),
        }
      : {}),
  };
}

function normalizeIssueSummary(raw: RawIssue): RedmineIssueSummary {
  return {
    id: raw.id,
    subject: raw.subject,
    project: raw.project,
    tracker: raw.tracker,
    status: {
      id: raw.status.id,
      name: raw.status.name,
      isClosed: raw.status.is_closed,
    },
    priority: raw.priority,
    assignedTo: raw.assigned_to,
    fixedVersion: raw.fixed_version,
    updatedOn: raw.updated_on,
  };
}

function normalizeProjectDetail(raw: RawProject): RedmineProject {
  return {
    id: raw.id,
    name: raw.name,
    identifier: raw.identifier,
    description: compactOptional(raw.description),
    status: raw.status,
    isPublic: raw.is_public,
    parent: raw.parent,
    createdOn: raw.created_on,
    updatedOn: raw.updated_on,
    trackers: raw.trackers,
    issueCategories: raw.issue_categories,
    issueCustomFields: raw.issue_custom_fields?.map((field) => ({
      id: field.id,
      name: field.name,
      fieldFormat: field.field_format,
      isRequired: field.is_required,
    })),
  };
}

function normalizeProjectSummary(raw: RawProject): RedmineProjectSummary {
  return {
    id: raw.id,
    name: raw.name,
    identifier: raw.identifier,
    parentId: raw.parent?.id,
  };
}

function normalizeVersion(raw: RawVersion): RedmineVersion {
  return {
    id: raw.id,
    project: raw.project,
    name: raw.name,
    description: compactOptional(raw.description),
    status: raw.status,
    dueDate: compactOptional(raw.due_date),
    sharing: raw.sharing,
    createdOn: raw.created_on,
    updatedOn: raw.updated_on,
  };
}

function normalizeMembership(raw: RawMembership): RedmineMembership {
  return {
    id: raw.id,
    project: raw.project,
    user: raw.user,
    group: raw.group,
    roles: raw.roles.map((role) => ({
      id: role.id,
      name: role.name,
      inherited: role.inherited,
    })),
  };
}

function normalizeSearchResult(raw: RawSearchResult): RedmineSearchResult {
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    url: raw.url,
    description: compactOptional(raw.description),
    datetime: compactOptional(raw.datetime),
  };
}

function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function toSubjectSubstringFilter(subject: string | undefined): string | undefined {
  const value = subject?.trim();

  if (!value) {
    return undefined;
  }

  return `~${value}`;
}

export class RedmineClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RedmineClientOptions) {
    if (!options.baseUrl) {
      throw new Error("REDMINE_URL is required");
    }

    if (!options.apiKey) {
      throw new Error("REDMINE_API_KEY is required");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("Redmine timeout must be a positive integer");
    }

    this.baseUrl = new URL(
      options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`,
    );
    this.apiKey = options.apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getCurrentUser(): Promise<RedmineUser> {
    const data = await this.requestJson("/users/current.json");
    const parsed = this.parse(
      currentUserResponseSchema,
      data,
      "GET /users/current.json",
    );

    return {
      id: parsed.user.id,
      login: parsed.user.login,
      firstname: parsed.user.firstname,
      lastname: parsed.user.lastname,
      ...(parsed.user.mail !== undefined ? { mail: parsed.user.mail } : {}),
    };
  }

  async getIssue(
    issueId: number,
    options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue> {
    const path = `/issues/${encodePathSegment(issueId)}.json`;
    const data = await this.requestJson(path, {
      include: options?.include,
    });
    const parsed = this.parse(issueResponseSchema, data, `GET ${path}`);

    return normalizeIssueDetail(parsed.issue);
  }

  async listIssues(
    params: RedmineListIssuesParams = {},
  ): Promise<RedminePaginatedResponse<RedmineIssueSummary>> {
    const data = await this.requestJson("/issues.json", {
      project_id: params.projectId,
      tracker_id: params.trackerId,
      status_id: params.statusId,
      assigned_to_id: params.assignedToId,
      fixed_version_id: params.fixedVersionId,
      subject: toSubjectSubstringFilter(params.subject),
      offset: params.offset,
      limit: params.limit ?? DEFAULT_CONTEXT_LIMIT,
      sort: params.sort,
    });

    const parsed = this.parse(issuesResponseSchema, data, "GET /issues.json");

    return {
      items: parsed.issues.map(normalizeIssueSummary),
      totalCount: parsed.total_count,
      offset: parsed.offset,
      limit: parsed.limit,
    };
  }

  async getProject(
    projectId: string | number,
    options?: { include?: readonly RedmineProjectInclude[] },
  ): Promise<RedmineProject> {
    const path = `/projects/${encodePathSegment(projectId)}.json`;
    const data = await this.requestJson(path, {
      include: options?.include,
    });
    const parsed = this.parse(projectResponseSchema, data, `GET ${path}`);

    return normalizeProjectDetail(parsed.project);
  }

  async listProjects(
    params: RedmineListProjectsParams = {},
  ): Promise<RedminePaginatedResponse<RedmineProjectSummary>> {
    const data = await this.requestJson("/projects.json", {
      offset: params.offset,
      limit: params.limit,
    });

    const parsed = this.parse(
      projectsResponseSchema,
      data,
      "GET /projects.json",
    );

    return {
      items: parsed.projects.map(normalizeProjectSummary),
      totalCount: parsed.total_count,
      offset: parsed.offset,
      limit: parsed.limit,
    };
  }

  async listProjectVersions(
    projectId: string | number,
  ): Promise<RedmineVersion[]> {
    const path = `/projects/${encodePathSegment(projectId)}/versions.json`;
    const data = await this.requestJson(path);
    const parsed = this.parse(versionsResponseSchema, data, `GET ${path}`);

    return parsed.versions.map(normalizeVersion);
  }

  async listProjectMemberships(
    projectId: string | number,
    params: RedmineListMembershipsParams = {},
  ): Promise<RedminePaginatedResponse<RedmineMembership>> {
    const path = `/projects/${encodePathSegment(projectId)}/memberships.json`;
    const data = await this.requestJson(path, {
      offset: params.offset,
      limit: params.limit,
    });
    const parsed = this.parse(membershipsResponseSchema, data, `GET ${path}`);

    return {
      items: parsed.memberships.map(normalizeMembership),
      totalCount: parsed.total_count,
      offset: parsed.offset,
      limit: parsed.limit,
    };
  }

  async listIssuePriorities(): Promise<RedmineNamedResource[]> {
    const path = "/enumerations/issue_priorities.json";
    const data = await this.requestJson(path);
    const parsed = this.parse(
      issuePrioritiesResponseSchema,
      data,
      `GET ${path}`,
    );

    return parsed.issue_priorities.map(({ id, name }) => ({ id, name }));
  }

  async search(
    params: RedmineSearchParams,
  ): Promise<RedminePaginatedResponse<RedmineSearchResult>> {
    const query = params.query.trim();

    if (!query) {
      throw new Error("Search query must not be empty");
    }

    const path =
      params.projectId === undefined
        ? "/search.json"
        : `/projects/${encodePathSegment(params.projectId)}/search.json`;

    const data = await this.requestJson(path, {
      q: query,
      offset: params.offset,
      limit: params.limit ?? DEFAULT_CONTEXT_LIMIT,
    });

    const parsed = this.parse(searchResponseSchema, data, `GET ${path}`);

    return {
      items: parsed.results.map(normalizeSearchResult),
      totalCount: parsed.total_count,
      offset: parsed.offset,
      limit: parsed.limit,
    };
  }

  private async requestJson(
    path: string,
    params: Record<string, QueryValue> = {},
  ): Promise<unknown> {
    const method = "GET";
    const requestUrl = new URL(path.replace(/^\/+/, ""), this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }

      requestUrl.searchParams.set(
        key,
        Array.isArray(value) ? value.join(",") : String(value),
      );
    }

    let response: Response;

    try {
      response = await this.fetchImpl(requestUrl, {
        method,
        headers: {
          Accept: "application/json",
          "X-Redmine-API-Key": this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RedmineNetworkError(
        `Redmine request failed before receiving a response: ${method} ${requestUrl.pathname}`,
        method,
        requestUrl.pathname,
        { cause: error },
      );
    }

    const body = await response.text();

    if (!response.ok) {
      throw new RedmineHttpError({
        method,
        path: requestUrl.pathname,
        status: response.status,
        statusText: response.statusText,
        errors: this.extractErrors(body),
      });
    }

    if (!body) {
      throw new RedmineResponseError(
        `${method} ${requestUrl.pathname}`,
        "response body was empty",
      );
    }

    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw new RedmineResponseError(
        `${method} ${requestUrl.pathname}`,
        "response body was not valid JSON",
        { cause: error },
      );
    }
  }

  private parse<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string,
  ): T {
    const result = schema.safeParse(data);

    if (!result.success) {
      throw new RedmineResponseError(
        context,
        result.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
        { cause: result.error },
      );
    }

    return result.data;
  }

  private extractErrors(body: string): string[] {
    if (!body) {
      return [];
    }

    try {
      const parsed = JSON.parse(body) as unknown;
      const result = z
        .object({
          errors: z.array(z.string()),
        })
        .safeParse(parsed);

      return result.success ? result.data.errors : [];
    } catch {
      return [];
    }
  }
}

export function createRedmineClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RedmineClient {
  const baseUrl = env.REDMINE_URL;
  const apiKey = env.REDMINE_API_KEY;

  if (!baseUrl) {
    throw new Error("REDMINE_URL is required");
  }

  if (!apiKey) {
    throw new Error("REDMINE_API_KEY is required");
  }

  let timeoutMs: number | undefined;

  if (env.REDMINE_TIMEOUT_MS !== undefined) {
    timeoutMs = Number(env.REDMINE_TIMEOUT_MS);

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("REDMINE_TIMEOUT_MS must be a positive integer");
    }
  }

  return new RedmineClient({
    baseUrl,
    apiKey,
    timeoutMs,
  });
}
