import { z } from "zod";

export const AGENT_BRIEF_FORMAT_VERSION = 1 as const;

export const AGENT_BRIEF_REQUIRED_SECTIONS = [
  "Goal",
  "Context",
  "In Scope",
  "Out of Scope",
  "Requirements",
  "Architecture / Contract Constraints",
  "Acceptance Criteria",
  "Verification",
  "Deliverables",
  "Unresolved / Blocking",
] as const;

export type AgentBriefSectionName =
  (typeof AGENT_BRIEF_REQUIRED_SECTIONS)[number];

const rfc3339TimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const nonEmptyStringSchema = z.string().trim().min(1);

export const agentBriefMetadataSchema = z
  .object({
    format_version: z.literal(AGENT_BRIEF_FORMAT_VERSION),
    redmine_issue_id: z.number().int().positive(),
    repository: nonEmptyStringSchema.optional(),
    implementation_target: nonEmptyStringSchema.optional(),
    brief_revision: z.number().int().positive(),
    requirements_fingerprint: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/u),
    brief_generated_at: z
      .string()
      .regex(rfc3339TimestampPattern)
      .optional(),
    source_updated_on: z
      .string()
      .regex(rfc3339TimestampPattern)
      .optional(),
    agent_hint: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    const targetCount =
      Number(metadata.repository !== undefined) +
      Number(metadata.implementation_target !== undefined);

    if (targetCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["repository"],
        message:
          "exactly one of repository or implementation_target is required",
      });
    }
  });

export type AgentBriefMetadata = z.infer<
  typeof agentBriefMetadataSchema
>;

export type AgentBriefValidationIssueCode =
  | "frontmatter_missing"
  | "frontmatter_syntax"
  | "metadata_duplicate"
  | "metadata_unknown"
  | "metadata_invalid"
  | "runtime_field_forbidden"
  | "unsupported_format_version"
  | "document_title_missing"
  | "document_structure_invalid"
  | "section_missing"
  | "section_duplicate"
  | "section_unknown"
  | "section_order_invalid"
  | "section_empty"
  | "acceptance_criteria_invalid"
  | "acceptance_criteria_duplicate"
  | "acceptance_criteria_state_forbidden"
  | "verification_reference_missing"
  | "verification_reference_unknown";

export interface AgentBriefValidationIssue {
  code: AgentBriefValidationIssueCode;
  path: string;
  message: string;
}

export interface AgentBrief {
  metadata: AgentBriefMetadata;
  sections: Record<AgentBriefSectionName, string>;
  acceptanceCriteriaIds: string[];
}

export type AgentBriefValidationResult =
  | {
      success: true;
      data: AgentBrief;
    }
  | {
      success: false;
      issues: AgentBriefValidationIssue[];
    };

const metadataFields = new Set([
  "format_version",
  "redmine_issue_id",
  "repository",
  "implementation_target",
  "brief_revision",
  "requirements_fingerprint",
  "brief_generated_at",
  "source_updated_on",
  "agent_hint",
]);

const integerMetadataFields = new Set([
  "format_version",
  "redmine_issue_id",
  "brief_revision",
]);

const forbiddenRuntimeFields = new Set([
  "status",
  "queue",
  "claim",
  "lease",
  "heartbeat",
  "retry",
  "retry_count",
  "workspace",
  "execution_state",
  "started_at",
  "completed_at",
]);

interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
  issues: AgentBriefValidationIssue[];
}

interface ParsedSections {
  sections: Record<AgentBriefSectionName, string>;
  issues: AgentBriefValidationIssue[];
}

function validationIssue(
  code: AgentBriefValidationIssueCode,
  path: string,
  message: string,
): AgentBriefValidationIssue {
  return { code, path, message };
}

function parseFrontmatter(markdown: string): ParsedFrontmatter | null {
  const normalized = markdown
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");

  if (lines[0] !== "---") {
    return null;
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );

  if (closingIndex === -1) {
    return {
      metadata: {},
      body: "",
      issues: [
        validationIssue(
          "frontmatter_syntax",
          "frontmatter",
          "frontmatter must end with a line containing exactly ---",
        ),
      ],
    };
  }

  const metadata: Record<string, unknown> = {};
  const issues: AgentBriefValidationIssue[] = [];

  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      continue;
    }

    const match = /^([a-z][a-z0-9_]*):[ \t]+(.+?)\s*$/u.exec(
      line,
    );

    if (match === null) {
      issues.push(
        validationIssue(
          "frontmatter_syntax",
          `frontmatter.line_${index + 1}`,
          "frontmatter entries must use key: value scalar syntax",
        ),
      );
      continue;
    }

    const key = match[1];
    const rawValue = match[2];

    if (key === undefined || rawValue === undefined) {
      continue;
    }

    if (Object.hasOwn(metadata, key)) {
      issues.push(
        validationIssue(
          "metadata_duplicate",
          `frontmatter.${key}`,
          `frontmatter field ${key} must appear only once`,
        ),
      );
      continue;
    }

    if (integerMetadataFields.has(key)) {
      metadata[key] = /^[1-9]\d*$/u.test(rawValue)
        ? Number(rawValue)
        : rawValue;
      continue;
    }

    if (rawValue.startsWith('"')) {
      try {
        const parsedValue: unknown = JSON.parse(rawValue);
        if (typeof parsedValue !== "string") {
          throw new TypeError("quoted metadata value must be a string");
        }
        metadata[key] = parsedValue;
      } catch {
        issues.push(
          validationIssue(
            "frontmatter_syntax",
            `frontmatter.${key}`,
            `${key} must be a valid JSON-quoted string or an unquoted scalar`,
          ),
        );
      }
      continue;
    }

    metadata[key] = rawValue;
  }

  return {
    metadata,
    body: lines.slice(closingIndex + 1).join("\n"),
    issues,
  };
}

function linesOutsideCodeFences(markdown: string): string[] {
  const output: string[] = [];
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;

  for (const line of markdown.split("\n")) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(line);

    if (fenceMatch !== null) {
      const marker = fenceMatch[1];
      if (marker === undefined) {
        continue;
      }

      const character = marker[0];
      if (character !== "`" && character !== "~") {
        continue;
      }

      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = marker.length;
      } else if (
        character === fenceCharacter &&
        marker.length >= fenceLength
      ) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }

    if (fenceCharacter === null) {
      output.push(line);
    }
  }

  return output;
}

function emptySectionRecord(): Record<AgentBriefSectionName, string> {
  return {
    Goal: "",
    Context: "",
    "In Scope": "",
    "Out of Scope": "",
    Requirements: "",
    "Architecture / Contract Constraints": "",
    "Acceptance Criteria": "",
    Verification: "",
    Deliverables: "",
    "Unresolved / Blocking": "",
  };
}

function parseSections(body: string): ParsedSections {
  const lines = body.split("\n");
  const issues: AgentBriefValidationIssue[] = [];
  const sections = emptySectionRecord();
  const titleIndexes: number[] = [];
  const headings: Array<{ name: string; lineIndex: number }> = [];
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(line);

    if (fenceMatch !== null) {
      const marker = fenceMatch[1];
      const character = marker?.[0];
      if (marker !== undefined && (character === "`" || character === "~")) {
        if (fenceCharacter === null) {
          fenceCharacter = character;
          fenceLength = marker.length;
        } else if (
          character === fenceCharacter &&
          marker.length >= fenceLength
        ) {
          fenceCharacter = null;
          fenceLength = 0;
        }
      }
      continue;
    }

    if (fenceCharacter !== null) {
      continue;
    }

    if (line === "## Agent Brief") {
      titleIndexes.push(index);
      continue;
    }

    const sectionMatch = /^### ([^#].*?)\s*$/u.exec(line);
    if (sectionMatch !== null && sectionMatch[1] !== undefined) {
      headings.push({ name: sectionMatch[1], lineIndex: index });
      continue;
    }

    if (/^#{1,3}\s+/u.test(line)) {
      issues.push(
        validationIssue(
          "document_structure_invalid",
          `body.line_${index + 1}`,
          `unexpected top-level heading: ${line}`,
        ),
      );
    }
  }

  if (titleIndexes.length === 0) {
    issues.push(
      validationIssue(
        "document_title_missing",
        "body",
        "body must contain the exact title ## Agent Brief",
      ),
    );
  } else {
    const titleIndex = titleIndexes[0];
    const precedingContent = lines
      .slice(0, titleIndex)
      .some((line) => line.trim() !== "");

    if (precedingContent || titleIndexes.length > 1) {
      issues.push(
        validationIssue(
          "document_structure_invalid",
          "body",
          "## Agent Brief must be the first body content and appear once",
        ),
      );
    }
  }

  const requiredSectionSet = new Set<string>(
    AGENT_BRIEF_REQUIRED_SECTIONS,
  );
  const seenSections = new Set<string>();
  const recognizedOrder: string[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading === undefined) {
      continue;
    }

    const nextHeading = headings[index + 1];
    const content = lines
      .slice(heading.lineIndex + 1, nextHeading?.lineIndex ?? lines.length)
      .join("\n")
      .trim();

    if (!requiredSectionSet.has(heading.name)) {
      issues.push(
        validationIssue(
          "section_unknown",
          `sections.${heading.name}`,
          `unknown Agent Brief section: ${heading.name}`,
        ),
      );
      continue;
    }

    if (seenSections.has(heading.name)) {
      issues.push(
        validationIssue(
          "section_duplicate",
          `sections.${heading.name}`,
          `${heading.name} must appear only once`,
        ),
      );
      continue;
    }

    const sectionName = heading.name as AgentBriefSectionName;
    seenSections.add(sectionName);
    recognizedOrder.push(sectionName);
    sections[sectionName] = content;

    if (content === "") {
      issues.push(
        validationIssue(
          "section_empty",
          `sections.${sectionName}`,
          `${sectionName} must not be empty`,
        ),
      );
    }
  }

  for (const sectionName of AGENT_BRIEF_REQUIRED_SECTIONS) {
    if (!seenSections.has(sectionName)) {
      issues.push(
        validationIssue(
          "section_missing",
          `sections.${sectionName}`,
          `required section ${sectionName} is missing`,
        ),
      );
    }
  }

  const expectedRecognizedOrder = AGENT_BRIEF_REQUIRED_SECTIONS.filter(
    (sectionName) => seenSections.has(sectionName),
  );
  if (
    recognizedOrder.join("\u0000") !==
    expectedRecognizedOrder.join("\u0000")
  ) {
    issues.push(
      validationIssue(
        "section_order_invalid",
        "sections",
        "Agent Brief sections must use the canonical order",
      ),
    );
  }

  return { sections, issues };
}

function validateAcceptanceAndVerification(
  sections: Record<AgentBriefSectionName, string>,
): {
  acceptanceCriteriaIds: string[];
  issues: AgentBriefValidationIssue[];
} {
  const issues: AgentBriefValidationIssue[] = [];
  const acceptanceCriteriaIds: string[] = [];
  const seenAcceptanceCriteria = new Set<string>();
  const acceptanceLines = linesOutsideCodeFences(
    sections["Acceptance Criteria"],
  );

  for (const line of acceptanceLines) {
    const completedMatch = /^\s*-\s+\[[xX]\]\s+/u.test(line);
    if (completedMatch) {
      issues.push(
        validationIssue(
          "acceptance_criteria_state_forbidden",
          "sections.Acceptance Criteria",
          "Agent Brief acceptance criteria must not store completion state",
        ),
      );
      continue;
    }

    if (!/^\s*-\s+\[ \]\s+/u.test(line)) {
      continue;
    }

    const match = /^\s*-\s+\[ \]\s+(AC-[1-9]\d*):\s+\S.*$/u.exec(
      line,
    );
    const acceptanceCriteriaId = match?.[1];

    if (acceptanceCriteriaId === undefined) {
      issues.push(
        validationIssue(
          "acceptance_criteria_invalid",
          "sections.Acceptance Criteria",
          "unchecked criteria must use - [ ] AC-N: description",
        ),
      );
      continue;
    }

    if (seenAcceptanceCriteria.has(acceptanceCriteriaId)) {
      issues.push(
        validationIssue(
          "acceptance_criteria_duplicate",
          `sections.Acceptance Criteria.${acceptanceCriteriaId}`,
          `${acceptanceCriteriaId} must appear only once`,
        ),
      );
      continue;
    }

    seenAcceptanceCriteria.add(acceptanceCriteriaId);
    acceptanceCriteriaIds.push(acceptanceCriteriaId);
  }

  if (acceptanceCriteriaIds.length === 0) {
    issues.push(
      validationIssue(
        "acceptance_criteria_invalid",
        "sections.Acceptance Criteria",
        "at least one unchecked AC-N criterion is required",
      ),
    );
  }

  const verificationReferences = new Set<string>();
  const verificationLines = linesOutsideCodeFences(sections.Verification);

  for (const line of verificationLines) {
    const match = /^\s*-\s+(AC-[1-9]\d*):\s+\S.*$/u.exec(line);
    const reference = match?.[1];

    if (reference === undefined) {
      continue;
    }

    if (!seenAcceptanceCriteria.has(reference)) {
      issues.push(
        validationIssue(
          "verification_reference_unknown",
          `sections.Verification.${reference}`,
          `${reference} does not identify an acceptance criterion`,
        ),
      );
      continue;
    }

    verificationReferences.add(reference);
  }

  for (const acceptanceCriteriaId of acceptanceCriteriaIds) {
    if (!verificationReferences.has(acceptanceCriteriaId)) {
      issues.push(
        validationIssue(
          "verification_reference_missing",
          `sections.Verification.${acceptanceCriteriaId}`,
          `${acceptanceCriteriaId} requires at least one verification entry`,
        ),
      );
    }
  }

  return { acceptanceCriteriaIds, issues };
}

function validateMetadata(
  rawMetadata: Record<string, unknown>,
): {
  metadata?: AgentBriefMetadata;
  issues: AgentBriefValidationIssue[];
} {
  const issues: AgentBriefValidationIssue[] = [];
  const schemaInput: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawMetadata)) {
    if (forbiddenRuntimeFields.has(key)) {
      issues.push(
        validationIssue(
          "runtime_field_forbidden",
          `frontmatter.${key}`,
          `${key} is runtime state and must not be stored in an Agent Brief`,
        ),
      );
      continue;
    }

    if (!metadataFields.has(key)) {
      issues.push(
        validationIssue(
          "metadata_unknown",
          `frontmatter.${key}`,
          `unknown Agent Brief metadata field: ${key}`,
        ),
      );
      continue;
    }

    schemaInput[key] = value;
  }

  const result = agentBriefMetadataSchema.safeParse(schemaInput);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      const isUnsupportedVersion =
        field === "format_version" &&
        typeof schemaInput.format_version === "number" &&
        schemaInput.format_version !== AGENT_BRIEF_FORMAT_VERSION;

      issues.push(
        validationIssue(
          isUnsupportedVersion
            ? "unsupported_format_version"
            : "metadata_invalid",
          `frontmatter.${issue.path.join(".") || "metadata"}`,
          isUnsupportedVersion
            ? `format_version ${String(schemaInput.format_version)} is not supported`
            : issue.message,
        ),
      );
    }
  }

  return result.success
    ? { metadata: result.data, issues }
    : { issues };
}

export function validateAgentBrief(
  markdown: string,
): AgentBriefValidationResult {
  const frontmatter = parseFrontmatter(markdown);

  if (frontmatter === null) {
    return {
      success: false,
      issues: [
        validationIssue(
          "frontmatter_missing",
          "frontmatter",
          "Agent Brief must start with a frontmatter delimiter",
        ),
      ],
    };
  }

  const metadataResult = validateMetadata(frontmatter.metadata);
  const sectionResult = parseSections(frontmatter.body);
  const acceptanceResult = validateAcceptanceAndVerification(
    sectionResult.sections,
  );
  const issues = [
    ...frontmatter.issues,
    ...metadataResult.issues,
    ...sectionResult.issues,
    ...acceptanceResult.issues,
  ];

  if (issues.length > 0 || metadataResult.metadata === undefined) {
    return { success: false, issues };
  }

  return {
    success: true,
    data: {
      metadata: metadataResult.metadata,
      sections: sectionResult.sections,
      acceptanceCriteriaIds: acceptanceResult.acceptanceCriteriaIds,
    },
  };
}
