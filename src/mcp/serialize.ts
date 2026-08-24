function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .toLowerCase();
}

function toPublicMcpValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const converted = toPublicMcpValue(item);

      return converted === undefined ? null : converted;
    });
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const entries: Array<[string, unknown]> = [];

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const converted = toPublicMcpValue(nestedValue);

    if (converted === undefined) {
      continue;
    }

    entries.push([toSnakeCase(key), converted]);
  }

  return Object.fromEntries(entries);
}

export function toPublicMcpObject(
  value: unknown,
): Record<string, unknown> {
  const converted = toPublicMcpValue(value);

  if (
    typeof converted !== "object" ||
    converted === null ||
    Array.isArray(converted)
  ) {
    throw new Error("Public MCP tool output must be an object");
  }

  return converted as Record<string, unknown>;
}

export function stringifyPublicMcpJson(value: unknown): string {
  return JSON.stringify(toPublicMcpObject(value));
}

export function createPublicMcpSuccessResult(value: unknown) {
  const structuredContent = toPublicMcpObject(value);

  return {
    isError: false,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent),
      },
    ],
    structuredContent,
  };
}
