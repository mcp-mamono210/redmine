export const CONTEXT_BASELINE_FORMAT_VERSION = 1;
export const TOKEN_ESTIMATE_BYTES_PER_TOKEN = 4;

export interface ContextSize {
  bytes: number;
  characters: number;
  estimated_tokens: number;
}

export interface ContextMeasurement {
  scenario: string;
  items: number;
  total: ContextSize;
  content_text: ContextSize;
  structured_content: ContextSize;
}

export interface ContextBaseline {
  format_version: number;
  token_estimate: {
    method: "utf8_bytes_divided_by_4_rounded_up";
    bytes_per_token: number;
  };
  scenarios: ContextMeasurement[];
}

function measureText(value: string): ContextSize {
  const bytes = Buffer.byteLength(value, "utf8");

  return {
    bytes,
    characters: [...value].length,
    estimated_tokens: Math.ceil(
      bytes / TOKEN_ESTIMATE_BYTES_PER_TOKEN,
    ),
  };
}

export function measureSerializedValue(
  value: unknown,
): ContextSize {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error("Value cannot be serialized to JSON");
  }

  return measureText(serialized);
}

export function measureSerializedBytes(value: unknown): number {
  return measureSerializedValue(value).bytes;
}

function getTextPayload(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const content = (value as { content?: unknown }).content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    )
    .map(({ text }) => text)
    .join("");
}

function getStructuredContent(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as { structuredContent?: unknown })
    .structuredContent;
}

export function measureContext(
  scenario: string,
  value: unknown,
  items: number,
): ContextMeasurement {
  if (!scenario) {
    throw new Error("Measurement scenario is required");
  }

  if (!Number.isInteger(items) || items < 0) {
    throw new Error("Measurement item count must be a non-negative integer");
  }

  const structuredContent = getStructuredContent(value);

  return {
    scenario,
    items,
    total: measureSerializedValue(value),
    content_text: measureText(getTextPayload(value)),
    structured_content:
      structuredContent === undefined
        ? measureText("")
        : measureSerializedValue(structuredContent),
  };
}

export function createContextBaseline(
  scenarios: ContextMeasurement[],
): ContextBaseline {
  return {
    format_version: CONTEXT_BASELINE_FORMAT_VERSION,
    token_estimate: {
      method: "utf8_bytes_divided_by_4_rounded_up",
      bytes_per_token: TOKEN_ESTIMATE_BYTES_PER_TOKEN,
    },
    scenarios,
  };
}
