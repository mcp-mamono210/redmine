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

function validationError(errors: string[] = []): RedmineHttpError {
  return new RedmineHttpError({
    method: "POST",
    path: "/issues.json",
    status: 422,
    statusText: "Unprocessable Content",
    errors,
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

  it("maps 422 to validation_error and preserves validation details", () => {
    expect(
      mapToMcpError(
        validationError([
          "Subject can't be blank",
          "Status is invalid",
        ]),
      ),
    ).toEqual({
      code: "validation_error",
      message: "Redmine rejected the request.",
      status: 422,
      details: {
        errors: [
          "Subject can't be blank",
          "Status is invalid",
        ],
      },
    });
  });

  it("omits details for a 422 response without validation errors", () => {
    expect(mapToMcpError(validationError())).toEqual({
      code: "validation_error",
      message: "Redmine rejected the request.",
      status: 422,
    });
  });

  it("bounds validation error count and normalizes whitespace", () => {
    const mapped = mapToMcpError(
      validationError([
        " First   validation\nerror ",
        "Second error",
        "Third error",
        "Fourth error",
        "Fifth error",
        "Sixth error",
        "Seventh error",
      ]),
    );

    expect(mapped.details?.errors).toHaveLength(5);
    expect(mapped.details?.errors[0]).toBe(
      "First validation error",
    );
    expect(mapped.details?.errors).not.toContain("Sixth error");
  });

  it("bounds individual validation error message length", () => {
    const mapped = mapToMcpError(
      validationError(["x".repeat(500)]),
    );

    const message = mapped.details?.errors[0];

    expect(message).toBeDefined();
    expect(message?.length).toBeLessThanOrEqual(200);
    expect(message?.endsWith("…")).toBe(true);
  });

  it("removes empty validation messages", () => {
    const mapped = mapToMcpError(
      validationError([
        "",
        "   ",
        "\n\t",
        "Subject can't be blank",
      ]),
    );

    expect(mapped.details?.errors).toEqual([
      "Subject can't be blank",
    ]);
  });

  it("sanitizes credentials in validation details", () => {
    const mapped = mapToMcpError(
      validationError([
        `Invalid value ${apiKey}`,
        "Authorization: Bearer top-secret-token",
        "password=hunter2 is invalid",
        "credential:super-secret is invalid",
        "X-Redmine-API-Key: another-secret",
      ]),
    );

    const serialized = JSON.stringify(mapped);

    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("top-secret-token");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("another-secret");
  });

  it("keeps other 4xx responses mapped to invalid_request", () => {
    expect(mapToMcpError(httpError(400, "Bad Request"))).toEqual({
      code: "invalid_request",
      message: "Redmine rejected the request.",
      status: 400,
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

  it("builds a sanitized MCP validation tool error result", () => {
    const error = validationError([
      "Subject can't be blank",
      `Invalid value ${apiKey}`,
    ]);

    const result = toToolErrorResult(error);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const content = result.content[0];

    expect(content?.type).toBe("text");

    if (!content) {
      throw new Error("Expected text content");
    }

    expect(content.text).toContain(
      '"code":"validation_error"',
    );
    expect(content.text).toContain(
      `"Subject can't be blank"`,
    );
    expect(content.text).toContain("[REDACTED]");
    expect(content.text).not.toContain(apiKey);
  });
});
