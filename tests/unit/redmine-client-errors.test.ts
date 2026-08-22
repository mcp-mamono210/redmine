import { describe, expect, it } from "vitest";

import { RedmineClient } from "../../src/redmine/client.js";
import {
  RedmineClientError,
  RedmineHttpError,
  RedmineNetworkError,
  RedmineResponseError,
} from "../../src/redmine/errors.js";

const baseUrl = "http://redmine.example.test";
const apiKey = "0123456789abcdef0123456789abcdef01234567";

function clientWith(
  fetchImpl: typeof fetch,
  timeoutMs = 10_000,
): RedmineClient {
  return new RedmineClient({
    baseUrl,
    apiKey,
    timeoutMs,
    fetchImpl,
  });
}

describe("RedmineClient error contract", () => {
  it("preserves the common error hierarchy", () => {
    const error = new RedmineHttpError({
      method: "GET",
      path: "/issues/1.json",
      status: 404,
      statusText: "Not Found",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RedmineClientError);
    expect(error).toBeInstanceOf(RedmineHttpError);
    expect(error.name).toBe("RedmineHttpError");
  });

  it("maps 403 responses to RedmineHttpError", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response('{"errors":["Forbidden operation"]}', {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);

      if (!(error instanceof RedmineHttpError)) {
        throw error;
      }

      expect(error.status).toBe(403);
      expect(error.statusText).toBe("Forbidden");
      expect(error.errors).toEqual(["Forbidden operation"]);
      expect(error.method).toBe("GET");
      expect(error.path).toBe("/users/current.json");
    }
  });

  it("maps 500 responses to RedmineHttpError without exposing raw bodies", async () => {
    const secretBody = `internal failure ${apiKey}`;

    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(secretBody, {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);
      expect(String(error)).not.toContain(secretBody);
      expect(String(error)).not.toContain(apiKey);
    }
  });

  it("extracts Redmine errors arrays from HTTP error bodies", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            errors: [
              "Subject cannot be blank",
              "Tracker is invalid",
            ],
          }),
          {
            status: 422,
            statusText: "Unprocessable Content",
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineHttpError);

      if (!(error instanceof RedmineHttpError)) {
        throw error;
      }

      expect(error.errors).toEqual([
        "Subject cannot be blank",
        "Tracker is invalid",
      ]);
    }
  });

  it("maps invalid JSON to RedmineResponseError", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response("not-json", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineResponseError);

      if (!(error instanceof RedmineResponseError)) {
        throw error;
      }

      expect(error.context).toBe("GET /users/current.json");
    }
  });

  it("does not include an invalid JSON response body in the error message", async () => {
    const body = `not-json-${apiKey}`;

    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineResponseError);
      expect(String(error)).not.toContain(body);
      expect(String(error)).not.toContain(apiKey);
    }
  });

  it("maps an empty successful body to RedmineResponseError", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response("", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineResponseError);

      if (!(error instanceof RedmineResponseError)) {
        throw error;
      }

      expect(error.context).toBe("GET /users/current.json");
      expect(error.message).toContain("response body was empty");
    }
  });

  it("maps schema mismatches to RedmineResponseError", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            user: {
              id: "not-a-number",
              login: "mcp-test",
              firstname: "MCP",
              lastname: "Test",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineResponseError);

      if (!(error instanceof RedmineResponseError)) {
        throw error;
      }

      expect(error.context).toBe("GET /users/current.json");
    }
  });

  it("limits schema mismatch details instead of serializing the response", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            user: {
              id: "bad",
              login: 1,
              firstname: 2,
              lastname: 3,
              mail: 4,
              api_key: apiKey,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineResponseError);
      expect(String(error)).not.toContain(apiKey);

      if (!(error instanceof RedmineResponseError)) {
        throw error;
      }

      const issueCount = error.message.split(";").length;

      expect(issueCount).toBeLessThanOrEqual(3);
    }
  });

  it("maps network failures to RedmineNetworkError", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.reject(new TypeError("connection failed"));

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineNetworkError);

      if (!(error instanceof RedmineNetworkError)) {
        throw error;
      }

      expect(error.method).toBe("GET");
      expect(error.path).toBe("/users/current.json");
    }
  });

  it("does not expose the API key in network errors", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.reject(
        new TypeError(`connection failed ${apiKey}`),
      );

    try {
      await clientWith(fetchImpl).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineNetworkError);
      expect(String(error)).not.toContain(apiKey);
    }
  });

  it("maps deterministic timeouts to RedmineNetworkError", async () => {
    const fetchImpl: typeof fetch = (
      _input: string | URL | Request,
      init?: RequestInit,
    ) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          reject(new Error("AbortSignal is required"));
          return;
        }

        const rejectFromAbort = (): void => {
          reject(new Error("Request aborted"));
        };

        if (signal.aborted) {
          rejectFromAbort();
          return;
        }

        signal.addEventListener("abort", rejectFromAbort, {
          once: true,
        });
      });

    try {
      await clientWith(fetchImpl, 1).getCurrentUser();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RedmineNetworkError);

      if (!(error instanceof RedmineNetworkError)) {
        throw error;
      }

      expect(error.method).toBe("GET");
      expect(error.path).toBe("/users/current.json");
      expect(error.message).not.toContain(apiKey);
    }
  });
});
