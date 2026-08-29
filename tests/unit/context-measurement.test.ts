import { describe, expect, it } from "vitest";

import {
  CONTEXT_BASELINE_FORMAT_VERSION,
  TOKEN_ESTIMATE_BYTES_PER_TOKEN,
  createContextBaseline,
  measureContext,
  measureContextWorkflow,
  measureSerializedBytes,
  measureSerializedValue,
} from "../helpers/context-measurement.js";

describe("Context measurement", () => {
  it("measures serialized ASCII values", () => {
    expect(measureSerializedValue("abc")).toEqual({
      bytes: 5,
      characters: 5,
      estimated_tokens: 2,
    });
    expect(measureSerializedBytes("abc")).toBe(5);
  });

  it("measures multibyte text in UTF-8 bytes and Unicode characters", () => {
    expect(measureSerializedValue("日本")).toEqual({
      bytes: 8,
      characters: 4,
      estimated_tokens: 2,
    });
  });

  it("returns the same result for repeated measurements", () => {
    const value = {
      items: [
        { id: 1, subject: "Authentication issue" },
        { id: 2, subject: "検索対象" },
      ],
      totalCount: 2,
      offset: 0,
      limit: 10,
    };

    expect(measureSerializedValue(value)).toEqual(
      measureSerializedValue(value),
    );
  });

  it("measures the complete result and its text and structured payloads", () => {
    const structuredContent = {
      items: [{ id: 1 }],
    };
    const text = JSON.stringify(structuredContent);
    const result = {
      content: [{ type: "text", text }],
      structuredContent,
    };

    expect(
      measureContext("list_issues_default", result, 1),
    ).toEqual({
      scenario: "list_issues_default",
      items: 1,
      total: measureSerializedValue(result),
      content_text: {
        bytes: Buffer.byteLength(text, "utf8"),
        characters: [...text].length,
        estimated_tokens: Math.ceil(
          Buffer.byteLength(text, "utf8") /
            TOKEN_ESTIMATE_BYTES_PER_TOKEN,
        ),
      },
      structured_content: measureSerializedValue(
        structuredContent,
      ),
    });
  });

  it("records zero component sizes when a response has no tool payload", () => {
    const measurement = measureContext(
      "tools/list",
      { tools: [] },
      0,
    );

    expect(measurement.content_text).toEqual({
      bytes: 0,
      characters: 0,
      estimated_tokens: 0,
    });
    expect(measurement.structured_content).toEqual({
      bytes: 0,
      characters: 0,
      estimated_tokens: 0,
    });
  });

  it("sums separately serialized MCP responses for workflow measurements", () => {
    const firstStructuredContent = {
      items: [{ id: 1 }],
    };
    const secondStructuredContent = {
      id: 1,
      subject: "Authentication issue",
    };
    const first = {
      content: [
        {
          type: "text",
          text: JSON.stringify(firstStructuredContent),
        },
      ],
      structuredContent: firstStructuredContent,
    };
    const second = {
      content: [
        {
          type: "text",
          text: JSON.stringify(secondStructuredContent),
        },
      ],
      structuredContent: secondStructuredContent,
    };

    const firstMeasurement = measureContext(
      "first",
      first,
      1,
    );
    const secondMeasurement = measureContext(
      "second",
      second,
      1,
    );
    const workflow = measureContextWorkflow(
      "workflow_search_get_issue",
      [first, second],
    );

    expect(workflow).toEqual({
      scenario: "workflow_search_get_issue",
      items: 2,
      total: {
        bytes:
          firstMeasurement.total.bytes +
          secondMeasurement.total.bytes,
        characters:
          firstMeasurement.total.characters +
          secondMeasurement.total.characters,
        estimated_tokens:
          firstMeasurement.total.estimated_tokens +
          secondMeasurement.total.estimated_tokens,
      },
      content_text: {
        bytes:
          firstMeasurement.content_text.bytes +
          secondMeasurement.content_text.bytes,
        characters:
          firstMeasurement.content_text.characters +
          secondMeasurement.content_text.characters,
        estimated_tokens:
          firstMeasurement.content_text.estimated_tokens +
          secondMeasurement.content_text.estimated_tokens,
      },
      structured_content: {
        bytes:
          firstMeasurement.structured_content.bytes +
          secondMeasurement.structured_content.bytes,
        characters:
          firstMeasurement.structured_content.characters +
          secondMeasurement.structured_content.characters,
        estimated_tokens:
          firstMeasurement.structured_content.estimated_tokens +
          secondMeasurement.structured_content.estimated_tokens,
      },
    });
  });

  it("creates a deterministic machine-readable baseline envelope", () => {
    const scenarios = [
      measureContext("tools/list", { tools: [] }, 0),
    ];

    expect(createContextBaseline(scenarios)).toEqual({
      format_version: CONTEXT_BASELINE_FORMAT_VERSION,
      token_estimate: {
        method: "utf8_bytes_divided_by_4_rounded_up",
        bytes_per_token: TOKEN_ESTIMATE_BYTES_PER_TOKEN,
      },
      scenarios,
    });
  });

  it("rejects invalid measurement metadata", () => {
    expect(() => measureContext("", {}, 0)).toThrow(
      "Measurement scenario is required",
    );
    expect(() => measureContext("invalid", {}, -1)).toThrow(
      "Measurement item count must be a non-negative integer",
    );
    expect(() => measureContextWorkflow("", [])).toThrow(
      "Measurement scenario is required",
    );
  });

  it("rejects values that JSON.stringify cannot serialize", () => {
    expect(() => measureSerializedValue(undefined)).toThrow(
      "Value cannot be serialized to JSON",
    );
  });
});
