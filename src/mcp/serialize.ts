
function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .toLowerCase();
}

function toPublicMcpValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toPublicMcpValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [
        toSnakeCase(key),
        toPublicMcpValue(nestedValue),
      ],
    ),
  );
}

export function stringifyPublicMcpJson(value: unknown): string {
  return JSON.stringify(toPublicMcpValue(value));
}
