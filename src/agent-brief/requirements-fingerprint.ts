import { createHash } from "node:crypto";

import {
  AGENT_BRIEF_GENERATION_INPUT_FORMAT_VERSION,
  type AgentBriefGenerationInput,
} from "./generation-input.js";

export const AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION =
  1 as const;

const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const MAX_REQUIREMENT_CUSTOM_FIELDS = 8;
const MAX_JOURNAL_NOTES = 10;
const MAX_RELATIONS = 20;
const MAX_CHILDREN = 10;

export interface AgentBriefRequirementsFingerprintPayload {
  format_version: 1;

  scope: {
    project_id: number;
    tracker_id: number;
    fixed_version_id?: number;
  };

  subject: string;
  description: string;

  requirement_custom_fields: Array<{
    id: number;
    name: string;
    value: string | string[];
  }>;

  journal_notes: string[];

  relations: Array<{
    relation_type: string;
    related_issue_id: number;
    delay?: number;
  }>;

  children: Array<{
    id: number;
    subject: string;
    tracker_id?: number;
  }>;
}

export class AgentBriefRequirementsFingerprintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBriefRequirementsFingerprintError";
  }
}

function fail(path: string, message: string): never {
  throw new AgentBriefRequirementsFingerprintError(
    `Invalid Phase 36 generation input at ${path}: ${message}`,
  );
}

function assertPositiveInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(path, "expected a positive safe integer");
  }
}

function assertNonNegativeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(path, "expected a non-negative safe integer");
  }
}

function assertString(value: string, path: string): void {
  if (typeof value !== "string") {
    fail(path, "expected a string");
  }
}

function assertNonEmptyString(value: string, path: string): void {
  assertString(value, path);

  if (value === "") {
    fail(path, "expected a non-empty string");
  }
}

function assertRfc3339Timestamp(value: string, path: string): void {
  assertString(value, path);

  if (!RFC3339_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, "expected an RFC 3339 timestamp with timezone");
  }
}

function assertBoundedArray(
  value: readonly unknown[],
  maxLength: number,
  path: string,
): void {
  if (!Array.isArray(value)) {
    fail(path, "expected an array");
  }

  if (value.length > maxLength) {
    fail(path, `expected at most ${maxLength} entries`);
  }
}

function assertCustomFieldValue(
  value: string | string[],
  path: string,
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      fail(path, "expected a non-empty scalar or array value");
    }

    for (const [index, entry] of value.entries()) {
      assertNonEmptyString(entry, `${path}[${index}]`);
    }

    return;
  }

  assertNonEmptyString(value, path);
}

function assertSortedUniquePositiveIntegers(
  values: readonly number[],
  path: string,
): void {
  let previous = 0;

  for (const [index, value] of values.entries()) {
    assertPositiveInteger(value, `${path}[${index}]`);

    if (value <= previous) {
      fail(path, "expected sorted unique positive integers");
    }

    previous = value;
  }
}

function assertGenerationInput(
  input: AgentBriefGenerationInput,
): void {
  if (
    input.format_version !==
    AGENT_BRIEF_GENERATION_INPUT_FORMAT_VERSION
  ) {
    fail(
      "format_version",
      `unsupported format version: ${String(input.format_version)}`,
    );
  }

  assertPositiveInteger(
    input.source.redmine_issue_id,
    "source.redmine_issue_id",
  );
  assertRfc3339Timestamp(
    input.source.source_updated_on,
    "source.source_updated_on",
  );

  assertPositiveInteger(input.source.project.id, "source.project.id");
  assertNonEmptyString(input.source.project.name, "source.project.name");
  assertPositiveInteger(input.source.tracker.id, "source.tracker.id");
  assertNonEmptyString(input.source.tracker.name, "source.tracker.name");

  if (input.source.fixed_version !== undefined) {
    assertPositiveInteger(
      input.source.fixed_version.id,
      "source.fixed_version.id",
    );
    assertNonEmptyString(
      input.source.fixed_version.name,
      "source.fixed_version.name",
    );
  }

  assertNonEmptyString(input.source.subject, "source.subject");
  assertString(input.source.description, "source.description");

  assertBoundedArray(
    input.requirement_custom_fields,
    MAX_REQUIREMENT_CUSTOM_FIELDS,
    "requirement_custom_fields",
  );

  let previousCustomFieldId = 0;

  for (const [index, field] of input.requirement_custom_fields.entries()) {
    const path = `requirement_custom_fields[${index}]`;
    assertPositiveInteger(field.id, `${path}.id`);

    if (field.id <= previousCustomFieldId) {
      fail(
        "requirement_custom_fields",
        "expected Phase 36 ascending custom-field ID order",
      );
    }

    previousCustomFieldId = field.id;
    assertString(field.name, `${path}.name`);
    assertCustomFieldValue(field.value, `${path}.value`);
  }

  assertBoundedArray(input.journal_notes, MAX_JOURNAL_NOTES, "journal_notes");

  for (const [index, journal] of input.journal_notes.entries()) {
    const path = `journal_notes[${index}]`;
    assertPositiveInteger(journal.id, `${path}.id`);
    assertRfc3339Timestamp(journal.created_on, `${path}.created_on`);
    assertNonEmptyString(journal.notes, `${path}.notes`);
  }

  assertBoundedArray(input.relations, MAX_RELATIONS, "relations");

  for (const [index, relation] of input.relations.entries()) {
    const path = `relations[${index}]`;
    assertPositiveInteger(relation.id, `${path}.id`);
    assertNonEmptyString(relation.relation_type, `${path}.relation_type`);
    assertPositiveInteger(
      relation.related_issue_id,
      `${path}.related_issue_id`,
    );

    if (relation.delay !== undefined && !Number.isSafeInteger(relation.delay)) {
      fail(`${path}.delay`, "expected a safe integer when present");
    }
  }

  assertBoundedArray(input.children, MAX_CHILDREN, "children");

  let previousChildId = 0;

  for (const [index, child] of input.children.entries()) {
    const path = `children[${index}]`;
    assertPositiveInteger(child.id, `${path}.id`);

    if (child.id <= previousChildId) {
      fail("children", "expected Phase 36 ascending child Issue ID order");
    }

    previousChildId = child.id;
    assertNonEmptyString(child.subject, `${path}.subject`);

    if (child.tracker !== undefined) {
      assertPositiveInteger(child.tracker.id, `${path}.tracker.id`);
      assertNonEmptyString(child.tracker.name, `${path}.tracker.name`);
    }
  }

  assertBoundedArray(
    input.projection.requirement_custom_field_ids,
    MAX_REQUIREMENT_CUSTOM_FIELDS,
    "projection.requirement_custom_field_ids",
  );
  assertSortedUniquePositiveIntegers(
    input.projection.requirement_custom_field_ids,
    "projection.requirement_custom_field_ids",
  );

  for (const [index, path] of input.projection.redacted_paths.entries()) {
    assertNonEmptyString(path, `projection.redacted_paths[${index}]`);
  }

  for (const [index, path] of input.projection.truncated_paths.entries()) {
    assertNonEmptyString(path, `projection.truncated_paths[${index}]`);
  }

  assertNonNegativeInteger(
    input.projection.omitted.requirement_custom_fields,
    "projection.omitted.requirement_custom_fields",
  );
  assertNonNegativeInteger(
    input.projection.omitted.journal_notes,
    "projection.omitted.journal_notes",
  );
  assertNonNegativeInteger(
    input.projection.omitted.relations,
    "projection.omitted.relations",
  );
  assertNonNegativeInteger(
    input.projection.omitted.children,
    "projection.omitted.children",
  );
}

function canonicalizePayload(
  payload: AgentBriefRequirementsFingerprintPayload,
): AgentBriefRequirementsFingerprintPayload {
  return {
    format_version:
      AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION,

    scope: {
      project_id: payload.scope.project_id,
      tracker_id: payload.scope.tracker_id,
      ...(payload.scope.fixed_version_id === undefined
        ? {}
        : { fixed_version_id: payload.scope.fixed_version_id }),
    },

    subject: payload.subject,
    description: payload.description,

    requirement_custom_fields: payload.requirement_custom_fields.map(
      (field) => ({
        id: field.id,
        name: field.name,
        value: Array.isArray(field.value) ? [...field.value] : field.value,
      }),
    ),

    journal_notes: [...payload.journal_notes],

    relations: payload.relations.map((relation) => ({
      relation_type: relation.relation_type,
      related_issue_id: relation.related_issue_id,
      ...(relation.delay === undefined ? {} : { delay: relation.delay }),
    })),

    children: payload.children.map((child) => ({
      id: child.id,
      subject: child.subject,
      ...(child.tracker_id === undefined ? {} : { tracker_id: child.tracker_id }),
    })),
  };
}

export function buildAgentBriefRequirementsFingerprintPayload(
  input: AgentBriefGenerationInput,
): AgentBriefRequirementsFingerprintPayload {
  assertGenerationInput(input);

  return {
    format_version:
      AGENT_BRIEF_REQUIREMENTS_FINGERPRINT_INPUT_FORMAT_VERSION,

    scope: {
      project_id: input.source.project.id,
      tracker_id: input.source.tracker.id,
      ...(input.source.fixed_version === undefined
        ? {}
        : { fixed_version_id: input.source.fixed_version.id }),
    },

    subject: input.source.subject,
    description: input.source.description,

    requirement_custom_fields: input.requirement_custom_fields.map(
      (field) => ({
        id: field.id,
        name: field.name,
        value: Array.isArray(field.value) ? [...field.value] : field.value,
      }),
    ),

    journal_notes: input.journal_notes.map((journal) => journal.notes),

    relations: input.relations.map((relation) => ({
      relation_type: relation.relation_type,
      related_issue_id: relation.related_issue_id,
      ...(relation.delay === undefined ? {} : { delay: relation.delay }),
    })),

    children: input.children.map((child) => ({
      id: child.id,
      subject: child.subject,
      ...(child.tracker === undefined ? {} : { tracker_id: child.tracker.id }),
    })),
  };
}

export function serializeAgentBriefRequirementsFingerprintPayload(
  payload: AgentBriefRequirementsFingerprintPayload,
): string {
  const canonical = canonicalizePayload(payload);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function calculateAgentBriefRequirementsFingerprint(
  input: AgentBriefGenerationInput,
): string {
  const payload = buildAgentBriefRequirementsFingerprintPayload(input);
  const serialized = serializeAgentBriefRequirementsFingerprintPayload(payload);
  const digest = createHash("sha256").update(serialized, "utf8").digest("hex");
  const fingerprint = `sha256:${digest}`;

  if (!SHA256_FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new AgentBriefRequirementsFingerprintError(
      "SHA-256 hashing did not produce the canonical requirements fingerprint representation",
    );
  }

  return fingerprint;
}
