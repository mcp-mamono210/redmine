import { describe, expect, it } from "vitest";

import {
  measureContext,
  measureSerializedBytes,
} from "../helpers/context-measurement.js";

describe("Context measurement", () => {
  it("measures JSON serialized ASCII values in UTF-8 bytes", () => {
    expect(measureSerializedBytes("abc")).toBe(5);
  });

  it("measures multibyte Japanese text in UTF-8 bytes", () => {
    expect(measureSerializedBytes("日本")).toBe(8);
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

    expect(measureSerializedBytes(value)).toBe(
      measureSerializedBytes(value),
    );
  });

  it("records scenario, item count, and serialized bytes", () => {
    const value = {
      items: [{ id: 1 }],
    };

    const measurement = measureContext(
      "list_issues_default",
      value,
      1,
    );

    expect(measurement).toEqual({
      scenario: "list_issues_default",
      items: 1,
      bytes: measureSerializedBytes(value),
    });
  });

  it("rejects invalid measurement metadata", () => {
    expect(() => measureContext("", {}, 0)).toThrow(
      "Measurement scenario is required",
    );
    expect(() => measureContext("invalid", {}, -1)).toThrow(
      "Measurement item count must be a non-negative integer",
    );
  });

  it("rejects values that JSON.stringify cannot serialize", () => {
    expect(() => measureSerializedBytes(undefined)).toThrow(
      "Value cannot be serialized to JSON",
    );
  });
});
