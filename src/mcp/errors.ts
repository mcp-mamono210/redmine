import {
  RedmineHttpError,
  RedmineNetworkError,
  RedmineResponseError,
} from "../redmine/errors.js";

export type McpErrorCode =
  | "authentication_failed"
  | "permission_denied"
  | "not_found"
  | "invalid_request"
  | "validation_error"
  | "backend_unavailable"
  | "invalid_backend_response"
  | "internal_error";

export interface McpErrorDetails {
  errors: string[];
}

export interface McpApplicationError {
  code: McpErrorCode;
  message: string;
  status?: number;
  details?: McpErrorDetails;
}

const HTTP_SERVER_ERROR_MIN = 500;
const MAX_VALIDATION_ERRORS = 5;
const MAX_VALIDATION_ERROR_LENGTH = 200;
const REDACTED = "[REDACTED]";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function redactValidationSecrets(value: string): string {
  let sanitized = value
    .replace(/\b[0-9a-f]{40}\b/giu, REDACTED)
    .replace(
      /\bX-Redmine-API-Key\s*:\s*[^,\s;]+/giu,
      `X-Redmine-API-Key: ${REDACTED}`,
    )
    .replace(
      /\bAuthorization\s*:\s*[^\r\n,;]+/giu,
      `Authorization: ${REDACTED}`,
    )
    .replace(
      /\b(password|credential|api[_ -]?key)\s*[:=]\s*[^,\s;]+/giu,
      `$1=${REDACTED}`,
    );

  const configuredApiKey = process.env.REDMINE_API_KEY;

  if (configuredApiKey) {
    sanitized = sanitized.split(configuredApiKey).join(REDACTED);
  }

  return sanitized;
}

function truncateValidationError(value: string): string {
  if (value.length <= MAX_VALIDATION_ERROR_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_VALIDATION_ERROR_LENGTH - 1)}…`;
}

function sanitizeValidationErrors(errors: readonly string[]): string[] {
  const sanitized: string[] = [];

  for (const error of errors) {
    const normalized = normalizeWhitespace(error);

    if (!normalized) {
      continue;
    }

    sanitized.push(
      truncateValidationError(redactValidationSecrets(normalized)),
    );

    if (sanitized.length >= MAX_VALIDATION_ERRORS) {
      break;
    }
  }

  return sanitized;
}

function mapHttpError(error: RedmineHttpError): McpApplicationError {
  if (error.status === 401) {
    return {
      code: "authentication_failed",
      message: "Redmine authentication failed.",
      status: error.status,
    };
  }

  if (error.status === 403) {
    return {
      code: "permission_denied",
      message:
        "The configured Redmine user does not have permission to perform this operation.",
      status: error.status,
    };
  }

  if (error.status === 404) {
    return {
      code: "not_found",
      message: "The requested Redmine resource was not found.",
      status: error.status,
    };
  }

  if (error.status === 422) {
    const errors = sanitizeValidationErrors(error.errors);

    return {
      code: "validation_error",
      message: "Redmine rejected the request.",
      status: error.status,
      ...(errors.length > 0
        ? {
            details: {
              errors,
            },
          }
        : {}),
    };
  }

  if (error.status >= HTTP_SERVER_ERROR_MIN) {
    return {
      code: "backend_unavailable",
      message: "Redmine is currently unavailable.",
      status: error.status,
    };
  }

  return {
    code: "invalid_request",
    message: "Redmine rejected the request.",
    status: error.status,
  };
}

export function mapToMcpError(error: unknown): McpApplicationError {
  if (error instanceof RedmineHttpError) {
    return mapHttpError(error);
  }

  if (error instanceof RedmineNetworkError) {
    return {
      code: "backend_unavailable",
      message: "Redmine is currently unavailable.",
    };
  }

  if (error instanceof RedmineResponseError) {
    return {
      code: "invalid_backend_response",
      message: "Redmine returned an invalid response.",
    };
  }

  return {
    code: "internal_error",
    message: "An unexpected internal error occurred.",
  };
}

export function toToolErrorResult(error: unknown) {
  const mapped = mapToMcpError(error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(mapped),
      },
    ],
  };
}
