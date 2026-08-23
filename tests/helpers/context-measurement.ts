export interface ContextMeasurement {
  scenario: string;
  items: number;
  bytes: number;
}

export function measureSerializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error("Value cannot be serialized to JSON");
  }

  return Buffer.byteLength(serialized, "utf8");
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

  return {
    scenario,
    items,
    bytes: measureSerializedBytes(value),
  };
}
