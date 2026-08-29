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

function addContextSizes(
  sizes: readonly ContextSize[],
): ContextSize {
  return sizes.reduce<ContextSize>(
    (total, size) => ({
      bytes: total.bytes + size.bytes,
      characters: total.characters + size.characters,
      estimated_tokens:
        total.estimated_tokens + size.estimated_tokens,
    }),
    {
      bytes: 0,
      characters: 0,
      estimated_tokens: 0,
    },
  );
}

function validateMeasurementMetadata(
  scenario: string,
  items: number,
): void {
  if (!scenario) {
    throw new Error("Measurement scenario is required");
  }

  if (!Number.isInteger(items) || items < 0) {
    throw new Error(
      "Measurement item count must be a non-negative integer",
    );
  }
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
  validateMeasurementMetadata(scenario, items);

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

export function measureContextWorkflow(
  scenario: string,
  values: readonly unknown[],
): ContextMeasurement {
  validateMeasurementMetadata(scenario, values.length);

  const components = values.map((value) =>
    measureContext("workflow_component", value, 0),
  );

  return {
    scenario,
    items: values.length,
    total: addContextSizes(
      components.map(({ total }) => total),
    ),
    content_text: addContextSizes(
      components.map(({ content_text }) => content_text),
    ),
    structured_content: addContextSizes(
      components.map(
        ({ structured_content }) => structured_content,
      ),
    ),
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
