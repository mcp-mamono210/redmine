import { z } from "zod";

import {
  RedmineHttpError,
  RedmineNetworkError,
  RedmineResponseError,
} from "./errors.js";
import {
  currentUserResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
  type RawIssue,
} from "./schemas.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineIssueSummary,
  RedmineListIssuesParams,
  RedminePaginatedResponse,
  RedmineUser,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

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
}

function compactOptional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function normalizeIssue(raw: RawIssue): RedmineIssue {
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
    journals: raw.journals?.map((journal) => ({
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
    relations: raw.relations?.map((relation) => ({
      id: relation.id,
      issueId: relation.issue_id,
      issueToId: relation.issue_to_id,
      relationType: relation.relation_type,
      delay: compactOptional(relation.delay),
    })),
    allowedStatuses: raw.allowed_statuses,
  };
}

function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export class RedmineClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

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

    return normalizeIssue(parsed.issue);
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
      subject: params.subject,
      offset: params.offset,
      limit: params.limit,
      sort: params.sort,
    });

    const parsed = this.parse(issuesResponseSchema, data, "GET /issues.json");

    return {
      items: parsed.issues.map(normalizeIssue),
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
      response = await fetch(requestUrl, {
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
