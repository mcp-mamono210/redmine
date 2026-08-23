
import { describe, expect, it } from "vitest";

import {
  stringifyPublicMcpJson,
} from "../../src/mcp/serialize.js";

describe("public MCP JSON serialization", () => {
  it("converts nested camelCase keys to snake_case", () => {
    const serialized = stringifyPublicMcpJson({
      totalCount: 1,
      items: [
        {
          assignedTo: {
            id: 7,
            name: "MCP Test",
          },
          fixedVersion: {
            id: 3,
            name: "v0.1.0",
          },
          status: {
            id: 1,
            name: "New",
            isClosed: false,
          },
        },
      ],
    });

    expect(JSON.parse(serialized) as unknown).toEqual({
      total_count: 1,
      items: [
        {
          assigned_to: {
            id: 7,
            name: "MCP Test",
          },
          fixed_version: {
            id: 3,
            name: "v0.1.0",
          },
          status: {
            id: 1,
            name: "New",
            is_closed: false,
          },
        },
      ],
    });
  });

  it("keeps existing snake_case keys stable", () => {
    const serialized = stringifyPublicMcpJson({
      custom_fields: [
        {
          field_format: "string",
          is_required: false,
        },
      ],
      allowed_statuses: [],
    });

    expect(JSON.parse(serialized) as unknown).toEqual({
      custom_fields: [
        {
          field_format: "string",
          is_required: false,
        },
      ],
      allowed_statuses: [],
    });
  });

  it("preserves primitive values, null, and arrays", () => {
    expect(
      JSON.parse(
        stringifyPublicMcpJson({
          values: ["a", 1, true, null],
        }),
      ) as unknown,
    ).toEqual({
      values: ["a", 1, true, null],
    });
  });
});
