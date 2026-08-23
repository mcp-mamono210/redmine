import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required for MCP E2E tests`,
    );
  }

  return value;
}

const redmineUrl = requiredEnv("REDMINE_URL");

function childEnv(
  apiKey: string,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(
    process.env,
  )) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env.REDMINE_URL = redmineUrl;
  env.REDMINE_API_KEY = apiKey;

  return env;
}

describe("redmine_get_current_user MCP error E2E", () => {
  it("maps invalid Redmine credentials to an exact sanitized MCP error envelope", async () => {
    const invalidApiKey =
      "invalid-api-key-for-mcp-e2e";

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/src/index.js"],
      env: childEnv(invalidApiKey),
    });

    const client = new Client({
      name: "redmine-mcp-error-e2e",
      version: "0.0.1",
    });

    try {
      await client.connect(transport);

      const result = await client.callTool({
        name: "redmine_get_current_user",
        arguments: {},
      });

      expect(result.isError).toBe(true);

      const textContent = result.content.find(
        (content) => content.type === "text",
      );

      expect(textContent).toBeDefined();

      if (
        !textContent ||
        textContent.type !== "text"
      ) {
        throw new Error("Expected text content");
      }

      const parsed = JSON.parse(
        textContent.text,
      ) as Record<string, unknown>;

      expect(parsed).toEqual({
        code: "authentication_failed",
        message: "Redmine authentication failed.",
        status: 401,
      });

      expect(textContent.text).not.toContain(
        invalidApiKey,
      );
      expect(textContent.text).not.toContain(
        "Authorization",
      );
      expect(textContent.text).not.toContain(
        "X-Redmine-API-Key",
      );
      expect(textContent.text).not.toContain(
        "stack",
      );
    } finally {
      await client.close();
    }
  });
});
