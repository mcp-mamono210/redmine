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
  | "backend_unavailable"
  | "invalid_backend_response"
  | "internal_error";

export interface McpApplicationError {
  code: McpErrorCode;
  message: string;
  status?: number;
}

const HTTP_SERVER_ERROR_MIN = 500;

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
