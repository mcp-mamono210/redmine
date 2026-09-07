import {
  RedmineHttpError,
  RedmineNetworkError,
} from "./errors.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface AgentBriefLifecycleCustomFieldIds {
  lifecycle: number;
  approvedBy: number;
  approvedAt: number;
  approvedBriefRevision: number;
  approvedPersistedRevision: number;
  approvedRequirementsFingerprint: number;
}

export interface AgentBriefLifecycleCustomFieldValues {
  lifecycle: string;
  approvedBy?: string;
  approvedAt?: string;
  approvedBriefRevision?: string;
  approvedPersistedRevision?: string;
  approvedRequirementsFingerprint?: string;
}

export interface AgentBriefLifecycleRedmineWriter {
  updateAgentBriefLifecycleFields(
    issueId: number,
    fieldIds: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): Promise<void>;
}

export interface RedmineHttpAgentBriefLifecycleWriterOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RedmineIssueCustomFieldValue {
  id: number;
  value: string;
}

function validateFieldIds(
  fieldIds: AgentBriefLifecycleCustomFieldIds,
): void {
  const ids = Object.values(fieldIds);

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error(
      "Agent Brief lifecycle custom-field IDs must be positive integers",
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error(
      "Agent Brief lifecycle custom-field IDs must be unique",
    );
  }
}

function pushIfDefined(
  output: RedmineIssueCustomFieldValue[],
  id: number,
  value: string | undefined,
): void {
  if (value !== undefined) {
    output.push({ id, value });
  }
}

function buildCustomFields(
  fieldIds: AgentBriefLifecycleCustomFieldIds,
  values: AgentBriefLifecycleCustomFieldValues,
): RedmineIssueCustomFieldValue[] {
  validateFieldIds(fieldIds);

  if (values.lifecycle.trim() === "") {
    throw new Error("Agent Brief lifecycle value must not be blank");
  }

  const customFields: RedmineIssueCustomFieldValue[] = [
    {
      id: fieldIds.lifecycle,
      value: values.lifecycle,
    },
  ];

  pushIfDefined(customFields, fieldIds.approvedBy, values.approvedBy);
  pushIfDefined(customFields, fieldIds.approvedAt, values.approvedAt);
  pushIfDefined(
    customFields,
    fieldIds.approvedBriefRevision,
    values.approvedBriefRevision,
  );
  pushIfDefined(
    customFields,
    fieldIds.approvedPersistedRevision,
    values.approvedPersistedRevision,
  );
  pushIfDefined(
    customFields,
    fieldIds.approvedRequirementsFingerprint,
    values.approvedRequirementsFingerprint,
  );

  return customFields;
}

export class RedmineHttpAgentBriefLifecycleWriter
  implements AgentBriefLifecycleRedmineWriter
{
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RedmineHttpAgentBriefLifecycleWriterOptions) {
    if (!options.baseUrl) {
      throw new Error("REDMINE_URL is required");
    }

    if (!options.apiKey) {
      throw new Error("Redmine API key is required");
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

  async updateAgentBriefLifecycleFields(
    issueId: number,
    fieldIds: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): Promise<void> {
    if (!Number.isInteger(issueId) || issueId <= 0) {
      throw new Error("Issue ID must be a positive integer");
    }

    const customFields = buildCustomFields(fieldIds, values);
    const method = "PUT";
    const path = `/issues/${encodeURIComponent(String(issueId))}.json`;
    const requestUrl = new URL(path.replace(/^\/+/, ""), this.baseUrl);
    let response: Response;

    try {
      response = await this.fetchImpl(requestUrl, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Redmine-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          issue: {
            custom_fields: customFields,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RedmineNetworkError(
        `Redmine request failed before receiving a response: ${method} ${path}`,
        method,
        path,
        { cause: error },
      );
    }

    const body = await response.text();

    if (!response.ok) {
      throw new RedmineHttpError({
        method,
        path,
        status: response.status,
        statusText: response.statusText,
        errors: extractErrors(body),
      });
    }
  }
}

function extractErrors(body: string): string[] {
  if (!body) {
    return [];
  }

  try {
    const parsed = JSON.parse(body) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "errors" in parsed &&
      Array.isArray((parsed as { errors?: unknown }).errors)
    ) {
      return (parsed as { errors: unknown[] }).errors.filter(
        (error): error is string => typeof error === "string",
      );
    }

    return [];
  } catch {
    return [];
  }
}
