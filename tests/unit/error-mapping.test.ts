import { describe, expect, it } from "vitest";

import {
  mapToMcpError,
  toToolErrorResult,
} from "../../src/mcp/errors.js";
import {
  RedmineHttpError,
  RedmineNetworkError,
  RedmineResponseError,
} from "../../src/redmine/errors.js";

const apiKey = "0123456789abcdef0123456789abcdef01234567";

function httpError(status: number, statusText: string): RedmineHttpError {
  return new RedmineHttpError({
    method: "GET",
    path: "/example.json",
    status,
    statusText,
  });
}

describe("MCP error mapping", () => {
  it("maps 401 to authentication_failed", () => {
    expect(mapToMcpError(httpError(401, "Unauthorized"))).toEqual({
      code: "authentication_failed",
      message: "Redmine authentication failed.",
      status: 401,
    });
  });

  it("maps 403 to permission_denied", () => {
    expect(mapToMcpError(httpError(403, "Forbidden"))).toEqual({
      code: "permission_denied",
      message:
        "The configured Redmine user does not have permission to perform this operation.",
      status: 403,
    });
  });

  it("maps 404 to not_found", () => {
    expect(mapToMcpError(httpError(404, "Not Found"))).toEqual({
      code: "not_found",
      message: "The requested Redmine resource was not found.",
      status: 404,
    });
  });

  it("maps other 4xx responses to invalid_request", () => {
    expect(
      mapToMcpError(
        new RedmineHttpError({
          method: "GET",
          path: "/example.json",
          status: 422,
          statusText: "Unprocessable Content",
          errors: [`Invalid value ${apiKey}`],
        }),
      ),
    ).toEqual({
      code: "invalid_request",
      message: "Redmine rejected the request.",
      status: 422,
    });
  });

  it("maps 5xx responses to backend_unavailable", () => {
    expect(mapToMcpError(httpError(503, "Service Unavailable"))).toEqual({
      code: "backend_unavailable",
      message: "Redmine is currently unavailable.",
      status: 503,
    });
  });

  it("maps network failures to backend_unavailable", () => {
    const error = new RedmineNetworkError(
      `connection failed ${apiKey}`,
      "GET",
      "/example.json",
    );

    expect(mapToMcpError(error)).toEqual({
      code: "backend_unavailable",
      message: "Redmine is currently unavailable.",
    });
  });

  it("maps invalid Redmine responses to invalid_backend_response", () => {
    const error = new RedmineResponseError(
      "GET /example.json",
      `invalid response ${apiKey}`,
    );

    expect(mapToMcpError(error)).toEqual({
      code: "invalid_backend_response",
      message: "Redmine returned an invalid response.",
    });
  });

  it("maps unknown errors to internal_error", () => {
    expect(mapToMcpError(new Error(`unexpected ${apiKey}`))).toEqual({
      code: "internal_error",
      message: "An unexpected internal error occurred.",
    });

    expect(mapToMcpError("unknown failure")).toEqual({
      code: "internal_error",
      message: "An unexpected internal error occurred.",
    });
  });

  it("builds a sanitized MCP tool error result", () => {
    const error = new RedmineHttpError({
      method: "GET",
      path: "/users/current.json",
      status: 401,
      statusText: "Unauthorized",
      errors: [`secret ${apiKey}`],
    });

    const result = toToolErrorResult(error);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const content = result.content[0];

    expect(content?.type).toBe("text");

    if (!content) {
      throw new Error("Expected text content");
    }

    expect(content.text).toContain('"code":"authentication_failed"');
    expect(content.text).not.toContain(apiKey);
    expect(content.text).not.toContain("secret");
  });
});
