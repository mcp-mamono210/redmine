import { describe, expect, it } from "vitest";

import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

describe("redmine_get_current_user MCP error E2E", () => {
  it("maps invalid Redmine credentials to an exact sanitized MCP error envelope", async () => {
    const invalidApiKey =
      "invalid-api-key-for-mcp-e2e";

    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-error-e2e",
      env: {
        REDMINE_API_KEY: invalidApiKey,
      },
    });

    try {
      const result = await harness.callTool(
        "redmine_get_current_user",
      );

      expect(result.isError).toBe(true);

      const text = requireTextContent(result.content);
      const parsed = JSON.parse(text) as Record<string, unknown>;

      expect(parsed).toEqual({
        code: "authentication_failed",
        message: "Redmine authentication failed.",
        status: 401,
      });

      expect(text).not.toContain(
        invalidApiKey,
      );
      expect(text).not.toContain(
        "Authorization",
      );
      expect(text).not.toContain(
        "X-Redmine-API-Key",
      );
      expect(text).not.toContain(
        "stack",
      );
    } finally {
      await harness.close();
    }
  });
});
