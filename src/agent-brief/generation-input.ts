import type {
  RedmineIssue,
  RedmineIssueRelation,
} from "../redmine/types.js";

export const AGENT_BRIEF_GENERATION_INPUT_FORMAT_VERSION = 1 as const;

const MAX_SERIALIZED_BYTES = 24_576;
const MAX_REQUIREMENT_CUSTOM_FIELDS = 8;
const MAX_JOURNALS = 10;
const MAX_RELATIONS = 20;
const MAX_CHILDREN = 10;

const MAX_NAME_BYTES = 256;
const MAX_SUBJECT_BYTES = 512;
const MAX_DESCRIPTION_BYTES = 8_192;
const MAX_CUSTOM_FIELD_VALUE_BYTES = 1_024;
const MAX_JOURNAL_NOTE_BYTES = 1_024;
const MAX_CHILD_SUBJECT_BYTES = 512;

const FINAL_BUDGET_DESCRIPTION_BYTES = 256;

const REDACTED_VALUE = "[REDACTED]";
const ELLIPSIS = "…";

const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const CREDENTIAL_SENSITIVE_NAME_PATTERN =
  /(password|credential|api[ _]?key|token|secret|authorization)/iu;

export interface GenerationInputProjectionPolicy {
  requirementCustomFieldIds?: readonly number[];
  configuredSecrets?: readonly string[];
}

export interface AgentBriefGenerationInput {
  format_version: 1;

  source: {
    redmine_issue_id: number;
    source_updated_on: string;

    project: {
      id: number;
      name: string;
    };

    tracker: {
      id: number;
      name: string;
    };

    fixed_version?: {
      id: number;
      name: string;
    };

    subject: string;
    description: string;
  };

  requirement_custom_fields: Array<{
    id: number;
    name: string;
    value: string | string[];
  }>;

  journal_notes: Array<{
    id: number;
    created_on: string;
    notes: string;
  }>;

  relations: Array<{
    id: number;
    relation_type: string;
    related_issue_id: number;
    delay?: number;
  }>;

  children: Array<{
    id: number;
    subject: string;

    tracker?: {
      id: number;
      name: string;
    };
  }>;

  projection: {
    requirement_custom_field_ids: number[];
    redacted_paths: string[];
    truncated_paths: string[];

    omitted: {
      requirement_custom_fields: number;
      journal_notes: number;
      relations: number;
      children: number;
    };
  };
}

export class AgentBriefGenerationInputProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBriefGenerationInputProjectionError";
  }
}

interface ProjectionTextState {
  configuredSecrets: readonly string[];
  redactedPaths: Set<string>;
  truncatedPaths: Set<string>;
}

function normalizeText(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .trim();
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) {
    return value;
  }

  const ellipsisBytes = utf8ByteLength(ELLIPSIS);
  let output = "";

  for (const character of value) {
    const candidateBytes =
      utf8ByteLength(output + character) + ellipsisBytes;

    if (candidateBytes > maxBytes) {
      break;
    }

    output += character;
  }

  return `${output}${ELLIPSIS}`;
}

function normalizeConfiguredSecrets(
  configuredSecrets: readonly string[] | undefined,
): string[] {
  return [
    ...new Set(
      (configuredSecrets ?? []).filter(
        (secret) => secret !== "",
      ),
    ),
  ].sort(
    (a, b) =>
      b.length - a.length ||
      a.localeCompare(b),
  );
}

function redactConfiguredSecrets(
  value: string,
  configuredSecrets: readonly string[],
): string {
  let redacted = value;

  for (const secret of configuredSecrets) {
    redacted = redacted
      .split(secret)
      .join(REDACTED_VALUE);
  }

  return redacted;
}

function redactCredentialPatterns(value: string): string {
  return value
    .replace(
      /(Authorization\s*:\s*)[^\n]+/giu,
      `$1${REDACTED_VALUE}`,
    )
    .replace(
      /(X-Redmine-API-Key\s*:\s*)[^\n]+/giu,
      `$1${REDACTED_VALUE}`,
    )
    .replace(
      /((?:password|credential|api[ _]?key|token|secret)\s*[:=]\s*)[^\s,;\n]+/giu,
      `$1${REDACTED_VALUE}`,
    );
}

function assertConfiguredSecretsRemoved(
  value: string,
  configuredSecrets: readonly string[],
): void {
  if (
    configuredSecrets.some(
      (secret) => value.includes(secret),
    )
  ) {
    throw new AgentBriefGenerationInputProjectionError(
      "configured secret could not be sanitized",
    );
  }
}

function sanitizeAndBoundText(
  rawValue: string,
  path: string,
  maxBytes: number,
  state: ProjectionTextState,
): string {
  let value = normalizeText(rawValue);
  const originalValue = value;

  value = redactConfiguredSecrets(
    value,
    state.configuredSecrets,
  );

  value = redactCredentialPatterns(value);

  assertConfiguredSecretsRemoved(
    value,
    state.configuredSecrets,
  );

  if (value !== originalValue) {
    state.redactedPaths.add(path);
  }

  const boundedValue = truncateUtf8(
    value,
    maxBytes,
  );

  if (boundedValue !== value) {
    state.truncatedPaths.add(path);
  }

  return boundedValue;
}

function normalizeRequirementCustomFieldIds(
  ids: readonly number[] | undefined,
): number[] {
  const normalizedIds = [
    ...new Set(ids ?? []),
  ].sort((a, b) => a - b);

  const hasInvalidId = normalizedIds.some(
    (id) => !Number.isInteger(id) || id <= 0,
  );

  if (
    normalizedIds.length >
      MAX_REQUIREMENT_CUSTOM_FIELDS ||
    hasInvalidId
  ) {
    throw new AgentBriefGenerationInputProjectionError(
      "requirement custom-field allowlist is invalid",
    );
  }

  return normalizedIds;
}

function isValidNamedResource(
  resource: {
    id: number;
    name: string;
  },
): boolean {
  return (
    Number.isInteger(resource.id) &&
    resource.id > 0 &&
    resource.name.trim() !== ""
  );
}

function validateSourceIssue(issue: RedmineIssue): void {
  const hasInvalidFixedVersion =
    issue.fixedVersion !== undefined &&
    !isValidNamedResource(issue.fixedVersion);

  const invalid =
    !Number.isInteger(issue.id) ||
    issue.id <= 0 ||
    !isValidNamedResource(issue.project) ||
    !isValidNamedResource(issue.tracker) ||
    hasInvalidFixedVersion ||
    issue.updatedOn === undefined ||
    !RFC3339_TIMESTAMP_PATTERN.test(
      issue.updatedOn,
    );

  if (invalid) {
    throw new AgentBriefGenerationInputProjectionError(
      "required Redmine Issue identity is missing or invalid",
    );
  }
}

function projectRequirementCustomFields(
  issue: RedmineIssue,
  requirementCustomFieldIds: readonly number[],
  state: ProjectionTextState,
): AgentBriefGenerationInput["requirement_custom_fields"] {
  const projected: AgentBriefGenerationInput["requirement_custom_fields"] =
    [];

  for (const id of requirementCustomFieldIds) {
    const field = issue.customFields.find(
      (candidate) => candidate.id === id,
    );

    if (field === undefined) {
      continue;
    }

    if (
      CREDENTIAL_SENSITIVE_NAME_PATTERN.test(
        field.name,
      )
    ) {
      continue;
    }

    const outputIndex = projected.length;
    const valuePath =
      `requirement_custom_fields[${outputIndex}].value`;

    const rawValues = Array.isArray(field.value)
      ? field.value
      : [field.value];

    const projectedValues = rawValues
      .map((value) =>
        sanitizeAndBoundText(
          value,
          valuePath,
          MAX_CUSTOM_FIELD_VALUE_BYTES,
          state,
        ),
      )
      .filter((value) => value !== "");

    if (projectedValues.length === 0) {
      continue;
    }

    const namePath =
      `requirement_custom_fields[${outputIndex}].name`;

    const fieldName = sanitizeAndBoundText(
      field.name,
      namePath,
      MAX_NAME_BYTES,
      state,
    );

    projected.push({
      id,
      name: fieldName,
      value: Array.isArray(field.value)
        ? projectedValues
        : (projectedValues[0] ?? ""),
    });
  }

  return projected;
}

function projectJournalNotes(
  issue: RedmineIssue,
  state: ProjectionTextState,
): {
  journalNotes: AgentBriefGenerationInput["journal_notes"];
  omittedCount: number;
} {
  const candidates = (issue.journals ?? [])
    .filter(
      (journal) =>
        normalizeText(journal.notes) !== "",
    )
    .sort(
      (a, b) =>
        b.createdOn.localeCompare(a.createdOn) ||
        b.id - a.id,
    );

  const selected = candidates
    .slice(0, MAX_JOURNALS)
    .sort(
      (a, b) =>
        a.createdOn.localeCompare(b.createdOn) ||
        a.id - b.id,
    );

  const journalNotes = selected.map(
    (journal, index) => ({
      id: journal.id,
      created_on: journal.createdOn,
      notes: sanitizeAndBoundText(
        journal.notes,
        `journal_notes[${index}].notes`,
        MAX_JOURNAL_NOTE_BYTES,
        state,
      ),
    }),
  );

  return {
    journalNotes,
    omittedCount: Math.max(
      0,
      candidates.length - selected.length,
    ),
  };
}

function projectRelation(
  sourceIssueId: number,
  relation: RedmineIssueRelation,
): AgentBriefGenerationInput["relations"][number] {
  const relatedIssueId =
    relation.issueId === sourceIssueId
      ? relation.issueToId
      : relation.issueToId === sourceIssueId
        ? relation.issueId
        : 0;

  if (relatedIssueId <= 0) {
    throw new AgentBriefGenerationInputProjectionError(
      "relation does not reference the source issue",
    );
  }

  return {
    id: relation.id,
    relation_type: relation.relationType,
    related_issue_id: relatedIssueId,
    ...(relation.delay === undefined
      ? {}
      : { delay: relation.delay }),
  };
}

function projectRelations(
  issue: RedmineIssue,
): {
  relations: AgentBriefGenerationInput["relations"];
  omittedCount: number;
} {
  const allRelations = (issue.relations ?? [])
    .map((relation) =>
      projectRelation(issue.id, relation),
    )
    .sort(
      (a, b) =>
        a.relation_type.localeCompare(
          b.relation_type,
        ) ||
        a.related_issue_id -
          b.related_issue_id ||
        a.id - b.id,
    );

  return {
    relations: allRelations.slice(
      0,
      MAX_RELATIONS,
    ),
    omittedCount: Math.max(
      0,
      allRelations.length - MAX_RELATIONS,
    ),
  };
}

function projectChildren(
  issue: RedmineIssue,
  state: ProjectionTextState,
): {
  children: AgentBriefGenerationInput["children"];
  omittedCount: number;
} {
  const sortedChildren = [
    ...(issue.children ?? []),
  ].sort((a, b) => a.id - b.id);

  const children = sortedChildren
    .slice(0, MAX_CHILDREN)
    .map((child, index) => ({
      id: child.id,
      subject: sanitizeAndBoundText(
        child.subject,
        `children[${index}].subject`,
        MAX_CHILD_SUBJECT_BYTES,
        state,
      ),
      ...(child.tracker === undefined
        ? {}
        : {
            tracker: {
              id: child.tracker.id,
              name: sanitizeAndBoundText(
                child.tracker.name,
                `children[${index}].tracker.name`,
                MAX_NAME_BYTES,
                state,
              ),
            },
          }),
    }));

  return {
    children,
    omittedCount: Math.max(
      0,
      sortedChildren.length - MAX_CHILDREN,
    ),
  };
}

function syncProjectionMetadata(
  input: AgentBriefGenerationInput,
  state: ProjectionTextState,
): void {
  input.projection.redacted_paths = [
    ...state.redactedPaths,
  ].sort();

  input.projection.truncated_paths = [
    ...state.truncatedPaths,
  ].sort();
}

function hasRequirementBearingSource(
  input: AgentBriefGenerationInput,
): boolean {
  return (
    input.source.subject !== "" ||
    input.source.description !== "" ||
    input.requirement_custom_fields.length >
      0 ||
    input.journal_notes.length > 0 ||
    input.relations.length > 0 ||
    input.children.length > 0
  );
}

function serializedByteLength(
  input: AgentBriefGenerationInput,
): number {
  return utf8ByteLength(
    serializeAgentBriefGenerationInput(input),
  );
}

function truncateFinalBudgetCustomField(
  input: AgentBriefGenerationInput,
  fieldIndex: number,
  state: ProjectionTextState,
): void {
  const field =
    input.requirement_custom_fields[
      fieldIndex
    ];

  if (field === undefined) {
    return;
  }

  const path =
    `requirement_custom_fields[${fieldIndex}].value`;

  if (Array.isArray(field.value)) {
    const reducedValues = field.value.map(
      (value) =>
        truncateUtf8(
          value,
          utf8ByteLength(ELLIPSIS),
        ),
    );

    const changed = reducedValues.some(
      (value, index) =>
        value !== field.value[index],
    );

    if (changed) {
      field.value = reducedValues;
      state.truncatedPaths.add(path);
    }

    return;
  }

  const reducedValue = truncateUtf8(
    field.value,
    utf8ByteLength(ELLIPSIS),
  );

  if (reducedValue !== field.value) {
    field.value = reducedValue;
    state.truncatedPaths.add(path);
  }
}

function reduceCustomFieldsForFinalBudget(
  input: AgentBriefGenerationInput,
  state: ProjectionTextState,
): void {
  for (
    let fieldIndex =
      input.requirement_custom_fields.length -
      1;
    fieldIndex >= 0 &&
    serializedByteLength(input) >
      MAX_SERIALIZED_BYTES;
    fieldIndex -= 1
  ) {
    truncateFinalBudgetCustomField(
      input,
      fieldIndex,
      state,
    );

    syncProjectionMetadata(input, state);
  }
}

function reduceDescriptionForFinalBudget(
  input: AgentBriefGenerationInput,
  state: ProjectionTextState,
): void {
  if (
    serializedByteLength(input) <=
    MAX_SERIALIZED_BYTES
  ) {
    return;
  }

  const reducedDescription = truncateUtf8(
    input.source.description,
    FINAL_BUDGET_DESCRIPTION_BYTES,
  );

  if (
    reducedDescription !==
    input.source.description
  ) {
    input.source.description =
      reducedDescription;

    state.truncatedPaths.add(
      "source.description",
    );

    syncProjectionMetadata(input, state);
  }
}

function enforceFinalBudget(
  input: AgentBriefGenerationInput,
  state: ProjectionTextState,
): void {
  while (
    serializedByteLength(input) >
      MAX_SERIALIZED_BYTES &&
    input.journal_notes.length > 0
  ) {
    input.journal_notes.shift();
    input.projection.omitted.journal_notes += 1;
  }

  while (
    serializedByteLength(input) >
      MAX_SERIALIZED_BYTES &&
    input.children.length > 0
  ) {
    input.children.pop();
    input.projection.omitted.children += 1;
  }

  while (
    serializedByteLength(input) >
      MAX_SERIALIZED_BYTES &&
    input.relations.length > 0
  ) {
    input.relations.pop();
    input.projection.omitted.relations += 1;
  }

  reduceCustomFieldsForFinalBudget(
    input,
    state,
  );

  reduceDescriptionForFinalBudget(
    input,
    state,
  );

  if (
    serializedByteLength(input) >
    MAX_SERIALIZED_BYTES
  ) {
    throw new AgentBriefGenerationInputProjectionError(
      "generation input exceeds the final byte budget",
    );
  }
}

export function serializeAgentBriefGenerationInput(
  input: AgentBriefGenerationInput,
): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

export function projectAgentBriefGenerationInput(
  issue: RedmineIssue,
  policy: GenerationInputProjectionPolicy = {},
): AgentBriefGenerationInput {
  validateSourceIssue(issue);

  const requirementCustomFieldIds =
    normalizeRequirementCustomFieldIds(
      policy.requirementCustomFieldIds,
    );

  const state: ProjectionTextState = {
    configuredSecrets:
      normalizeConfiguredSecrets(
        policy.configuredSecrets,
      ),
    redactedPaths: new Set<string>(),
    truncatedPaths: new Set<string>(),
  };

  const subject = sanitizeAndBoundText(
    issue.subject,
    "source.subject",
    MAX_SUBJECT_BYTES,
    state,
  );

  if (subject === "") {
    throw new AgentBriefGenerationInputProjectionError(
      "source subject is required",
    );
  }

  const requirementCustomFields =
    projectRequirementCustomFields(
      issue,
      requirementCustomFieldIds,
      state,
    );

  const journals = projectJournalNotes(
    issue,
    state,
  );

  const relations = projectRelations(issue);

  const children = projectChildren(
    issue,
    state,
  );

  const input: AgentBriefGenerationInput = {
    format_version:
      AGENT_BRIEF_GENERATION_INPUT_FORMAT_VERSION,

    source: {
      redmine_issue_id: issue.id,
      source_updated_on: issue.updatedOn!,

      project: {
        id: issue.project.id,
        name: sanitizeAndBoundText(
          issue.project.name,
          "source.project.name",
          MAX_NAME_BYTES,
          state,
        ),
      },

      tracker: {
        id: issue.tracker.id,
        name: sanitizeAndBoundText(
          issue.tracker.name,
          "source.tracker.name",
          MAX_NAME_BYTES,
          state,
        ),
      },

      ...(issue.fixedVersion === undefined
        ? {}
        : {
            fixed_version: {
              id: issue.fixedVersion.id,
              name: sanitizeAndBoundText(
                issue.fixedVersion.name,
                "source.fixed_version.name",
                MAX_NAME_BYTES,
                state,
              ),
            },
          }),

      subject,

      description: sanitizeAndBoundText(
        issue.description ?? "",
        "source.description",
        MAX_DESCRIPTION_BYTES,
        state,
      ),
    },

    requirement_custom_fields:
      requirementCustomFields,

    journal_notes: journals.journalNotes,

    relations: relations.relations,

    children: children.children,

    projection: {
      requirement_custom_field_ids:
        requirementCustomFieldIds,

      redacted_paths: [],
      truncated_paths: [],

      omitted: {
        requirement_custom_fields: 0,
        journal_notes:
          journals.omittedCount,
        relations:
          relations.omittedCount,
        children:
          children.omittedCount,
      },
    },
  };

  syncProjectionMetadata(input, state);

  if (!hasRequirementBearingSource(input)) {
    throw new AgentBriefGenerationInputProjectionError(
      "no requirement-bearing source remains after projection",
    );
  }

  enforceFinalBudget(input, state);
  syncProjectionMetadata(input, state);

  return input;
}
