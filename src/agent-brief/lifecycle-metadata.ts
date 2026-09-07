import type { WriteGuard } from "../mcp/write-guard.js";
import type {
  RedmineCustomField,
  RedmineIssue,
  RedmineProject,
} from "../redmine/types.js";
import type {
  AgentBriefLifecycleCustomFieldIds,
  AgentBriefLifecycleCustomFieldValues,
  AgentBriefLifecycleRedmineWriter,
} from "../redmine/issue-custom-field-writer.js";

export const AGENT_BRIEF_LIFECYCLE_FIELD_NAMES = {
  lifecycle: "Agent Brief Lifecycle",
  approvedBy: "Brief Approved By",
  approvedAt: "Brief Approved At",
  approvedBriefRevision: "Approved Brief Revision",
  approvedPersistedRevision: "Approved Persisted Revision",
  approvedRequirementsFingerprint: "Approved Req Fingerprint",
} as const;

export const AGENT_BRIEF_LIFECYCLE_STATES = [
  "Brief Draft",
  "Brief Ready",
  "Ready for Agent",
] as const;

export type AgentBriefLifecycleState =
  (typeof AGENT_BRIEF_LIFECYCLE_STATES)[number];

export interface AgentBriefApprovalMetadata {
  approverIdentity: string;
  approvedAt: string;
  approvedBriefRevision: number;
  approvedPersistedRevision: string;
  approvedRequirementsFingerprint: string;
}

export interface AgentBriefApprovalMetadataSnapshot {
  approverIdentity?: string;
  approvedAt?: string;
  approvedBriefRevision?: number;
  approvedPersistedRevision?: string;
  approvedRequirementsFingerprint?: string;
}

export interface AgentBriefLifecycleSnapshot {
  issueId: number;
  projectId: number;
  projectName: string;
  lifecycle: AgentBriefLifecycleState;
  approvalMetadata: AgentBriefApprovalMetadataSnapshot;
  handoffEligible: boolean;
}

export interface AgentBriefLifecycleReader {
  getIssue(issueId: number): Promise<RedmineIssue>;
  getProject(projectId: string | number): Promise<RedmineProject>;
}

export interface AgentBriefLifecycleTransitionRequest {
  targetLifecycle: AgentBriefLifecycleState;
  approvalMetadata?: AgentBriefApprovalMetadata;
}

export type AgentBriefLifecycleErrorCode =
  | "lifecycle_mapping_missing"
  | "lifecycle_mapping_ambiguous"
  | "unknown_lifecycle_state"
  | "invalid_lifecycle_transition"
  | "approval_metadata_incomplete"
  | "approval_metadata_invalid"
  | "approval_reference_mismatch"
  | "writes_disabled"
  | "project_not_allowed";

export class AgentBriefLifecycleError extends Error {
  readonly code: AgentBriefLifecycleErrorCode;

  constructor(code: AgentBriefLifecycleErrorCode, message: string) {
    super(message);
    this.name = "AgentBriefLifecycleError";
    this.code = code;
  }
}

interface ResolvedMapping {
  lifecycle: RedmineCustomField;
  approvedBy: RedmineCustomField;
  approvedAt: RedmineCustomField;
  approvedBriefRevision: RedmineCustomField;
  approvedPersistedRevision: RedmineCustomField;
  approvedRequirementsFingerprint: RedmineCustomField;
}

const RFC_3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const APPROVER_PATTERN = /^redmine-user:[1-9]\d*$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const REQUIREMENTS_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

function lifecycleFieldNames(): readonly string[] {
  return Object.values(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES);
}

function resolveCanonicalField(
  customFields: readonly RedmineCustomField[],
  name: string,
): RedmineCustomField {
  const matches = customFields.filter((field) => field.name === name);

  if (matches.length === 0) {
    throw new AgentBriefLifecycleError(
      "lifecycle_mapping_missing",
      `Required Agent Brief custom field is missing: ${name}`,
    );
  }

  if (matches.length > 1) {
    throw new AgentBriefLifecycleError(
      "lifecycle_mapping_ambiguous",
      `Required Agent Brief custom field is ambiguous: ${name}`,
    );
  }

  return matches[0]!;
}

function resolveMapping(issue: RedmineIssue): ResolvedMapping {
  const fields = issue.customFields;

  return {
    lifecycle: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle,
    ),
    approvedBy: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy,
    ),
    approvedAt: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt,
    ),
    approvedBriefRevision: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
    ),
    approvedPersistedRevision: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
    ),
    approvedRequirementsFingerprint: resolveCanonicalField(
      fields,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedRequirementsFingerprint,
    ),
  };
}

function scalarFieldValue(field: RedmineCustomField): string {
  if (Array.isArray(field.value)) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      `Agent Brief custom field must contain one scalar value: ${field.name}`,
    );
  }

  return field.value;
}

function parseLifecycle(field: RedmineCustomField): AgentBriefLifecycleState {
  const value = scalarFieldValue(field);

  if (!value) {
    throw new AgentBriefLifecycleError(
      "lifecycle_mapping_missing",
      "Agent Brief lifecycle value is missing",
    );
  }

  if (
    !AGENT_BRIEF_LIFECYCLE_STATES.includes(
      value as AgentBriefLifecycleState,
    )
  ) {
    throw new AgentBriefLifecycleError(
      "unknown_lifecycle_state",
      `Unknown Agent Brief lifecycle value: ${value}`,
    );
  }

  return value as AgentBriefLifecycleState;
}

function parseOptionalApprover(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!APPROVER_PATTERN.test(value)) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Brief Approved By must use redmine-user:<positive-user-id>",
    );
  }

  return value;
}

function parseOptionalApprovedAt(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!RFC_3339_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Brief Approved At must be an RFC 3339 timestamp with timezone",
    );
  }

  return value;
}

function parseOptionalRevision(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Approved Brief Revision must be a positive base-10 integer",
    );
  }

  const revision = Number(value);

  if (!Number.isSafeInteger(revision)) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Approved Brief Revision is outside the supported integer range",
    );
  }

  return revision;
}

function parseOptionalPersistedRevision(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!value.trim()) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Approved Persisted Revision must not be blank",
    );
  }

  return value;
}

function parseOptionalFingerprint(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!REQUIREMENTS_FINGERPRINT_PATTERN.test(value)) {
    throw new AgentBriefLifecycleError(
      "approval_metadata_invalid",
      "Approved Req Fingerprint must use sha256:<64 lowercase hexadecimal characters>",
    );
  }

  return value;
}

function parseApprovalMetadata(
  mapping: ResolvedMapping,
): AgentBriefApprovalMetadataSnapshot {
  const approverIdentity = parseOptionalApprover(
    scalarFieldValue(mapping.approvedBy),
  );
  const approvedAt = parseOptionalApprovedAt(
    scalarFieldValue(mapping.approvedAt),
  );
  const approvedBriefRevision = parseOptionalRevision(
    scalarFieldValue(mapping.approvedBriefRevision),
  );
  const approvedPersistedRevision = parseOptionalPersistedRevision(
    scalarFieldValue(mapping.approvedPersistedRevision),
  );
  const approvedRequirementsFingerprint = parseOptionalFingerprint(
    scalarFieldValue(mapping.approvedRequirementsFingerprint),
  );

  return {
    ...(approverIdentity === undefined ? {} : { approverIdentity }),
    ...(approvedAt === undefined ? {} : { approvedAt }),
    ...(approvedBriefRevision === undefined
      ? {}
      : { approvedBriefRevision }),
    ...(approvedPersistedRevision === undefined
      ? {}
      : { approvedPersistedRevision }),
    ...(approvedRequirementsFingerprint === undefined
      ? {}
      : { approvedRequirementsFingerprint }),
  };
}

function isCompleteApprovalMetadata(
  metadata: AgentBriefApprovalMetadataSnapshot,
): metadata is AgentBriefApprovalMetadata {
  return (
    metadata.approverIdentity !== undefined &&
    metadata.approvedAt !== undefined &&
    metadata.approvedBriefRevision !== undefined &&
    metadata.approvedPersistedRevision !== undefined &&
    metadata.approvedRequirementsFingerprint !== undefined
  );
}

function validateApprovalMetadataInput(
  metadata: AgentBriefApprovalMetadata,
): AgentBriefApprovalMetadata {
  const validated: AgentBriefApprovalMetadata = {
    approverIdentity:
      parseOptionalApprover(metadata.approverIdentity) ??
      invalidApprovalInput("Brief Approved By is required"),
    approvedAt:
      parseOptionalApprovedAt(metadata.approvedAt) ??
      invalidApprovalInput("Brief Approved At is required"),
    approvedBriefRevision:
      parseOptionalRevision(String(metadata.approvedBriefRevision)) ??
      invalidApprovalInput("Approved Brief Revision is required"),
    approvedPersistedRevision:
      parseOptionalPersistedRevision(metadata.approvedPersistedRevision) ??
      invalidApprovalInput("Approved Persisted Revision is required"),
    approvedRequirementsFingerprint:
      parseOptionalFingerprint(metadata.approvedRequirementsFingerprint) ??
      invalidApprovalInput("Approved Req Fingerprint is required"),
  };

  return validated;
}

function invalidApprovalInput(message: string): never {
  throw new AgentBriefLifecycleError("approval_metadata_incomplete", message);
}

function assertTransitionAllowed(
  current: AgentBriefLifecycleState,
  target: AgentBriefLifecycleState,
): void {
  const allowedTargets: Readonly<Record<AgentBriefLifecycleState, readonly AgentBriefLifecycleState[]>> = {
    "Brief Draft": ["Brief Ready"],
    "Brief Ready": ["Brief Draft", "Ready for Agent"],
    "Ready for Agent": ["Brief Draft"],
  };

  if (!allowedTargets[current].includes(target)) {
    throw new AgentBriefLifecycleError(
      "invalid_lifecycle_transition",
      `Invalid Agent Brief lifecycle transition: ${current} -> ${target}`,
    );
  }
}

function mappingFieldIds(
  mapping: ResolvedMapping,
): AgentBriefLifecycleCustomFieldIds {
  return {
    lifecycle: mapping.lifecycle.id,
    approvedBy: mapping.approvedBy.id,
    approvedAt: mapping.approvedAt.id,
    approvedBriefRevision: mapping.approvedBriefRevision.id,
    approvedPersistedRevision: mapping.approvedPersistedRevision.id,
    approvedRequirementsFingerprint:
      mapping.approvedRequirementsFingerprint.id,
  };
}

function lifecycleWriteValues(
  targetLifecycle: AgentBriefLifecycleState,
  metadata: AgentBriefApprovalMetadata | undefined,
): AgentBriefLifecycleCustomFieldValues {
  return {
    lifecycle: targetLifecycle,
    ...(metadata === undefined
      ? {}
      : {
          approvedBy: metadata.approverIdentity,
          approvedAt: metadata.approvedAt,
          approvedBriefRevision: String(
            metadata.approvedBriefRevision,
          ),
          approvedPersistedRevision:
            metadata.approvedPersistedRevision,
          approvedRequirementsFingerprint:
            metadata.approvedRequirementsFingerprint,
        }),
  };
}

function metadataMatches(
  actual: AgentBriefApprovalMetadataSnapshot,
  expected: AgentBriefApprovalMetadata,
): boolean {
  return (
    actual.approverIdentity === expected.approverIdentity &&
    actual.approvedAt === expected.approvedAt &&
    actual.approvedBriefRevision === expected.approvedBriefRevision &&
    actual.approvedPersistedRevision === expected.approvedPersistedRevision &&
    actual.approvedRequirementsFingerprint ===
      expected.approvedRequirementsFingerprint
  );
}

export class AgentBriefLifecycleMetadataBoundary {
  constructor(
    private readonly reader: AgentBriefLifecycleReader,
    private readonly writer: AgentBriefLifecycleRedmineWriter,
    private readonly writeGuard: WriteGuard,
  ) {}

  async read(issueId: number): Promise<AgentBriefLifecycleSnapshot> {
    const { snapshot } = await this.readResolved(issueId);
    return snapshot;
  }

  async transition(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    const { issue, mapping, snapshot } = await this.readResolved(issueId);
    assertTransitionAllowed(snapshot.lifecycle, request.targetLifecycle);

    let approvalMetadata: AgentBriefApprovalMetadata | undefined;

    if (request.targetLifecycle === "Ready for Agent") {
      if (request.approvalMetadata === undefined) {
        throw new AgentBriefLifecycleError(
          "approval_metadata_incomplete",
          "Ready for Agent requires complete approval metadata",
        );
      }

      approvalMetadata = validateApprovalMetadataInput(
        request.approvalMetadata,
      );
    } else if (request.approvalMetadata !== undefined) {
      throw new AgentBriefLifecycleError(
        "approval_metadata_invalid",
        "Approval metadata may only be written with Ready for Agent",
      );
    }

    const project = await this.reader.getProject(issue.project.id);
    this.assertWriteAllowed(project.identifier);

    await this.writer.updateAgentBriefLifecycleFields(
      issueId,
      mappingFieldIds(mapping),
      lifecycleWriteValues(
        request.targetLifecycle,
        approvalMetadata,
      ),
    );

    const verified = await this.read(issueId);

    if (verified.lifecycle !== request.targetLifecycle) {
      throw new AgentBriefLifecycleError(
        "approval_reference_mismatch",
        "Redmine lifecycle read-back did not match the requested transition",
      );
    }

    if (
      approvalMetadata !== undefined &&
      !metadataMatches(verified.approvalMetadata, approvalMetadata)
    ) {
      throw new AgentBriefLifecycleError(
        "approval_reference_mismatch",
        "Redmine approval metadata read-back did not match the requested approval reference",
      );
    }

    return verified;
  }

  private async readResolved(issueId: number): Promise<{
    issue: RedmineIssue;
    mapping: ResolvedMapping;
    snapshot: AgentBriefLifecycleSnapshot;
  }> {
    const issue = await this.reader.getIssue(issueId);
    const mapping = resolveMapping(issue);
    const lifecycle = parseLifecycle(mapping.lifecycle);
    const approvalMetadata = parseApprovalMetadata(mapping);

    if (
      lifecycle === "Ready for Agent" &&
      !isCompleteApprovalMetadata(approvalMetadata)
    ) {
      throw new AgentBriefLifecycleError(
        "approval_metadata_incomplete",
        "Ready for Agent requires all approval metadata fields",
      );
    }

    return {
      issue,
      mapping,
      snapshot: {
        issueId: issue.id,
        projectId: issue.project.id,
        projectName: issue.project.name,
        lifecycle,
        approvalMetadata,
        handoffEligible:
          lifecycle === "Ready for Agent" &&
          isCompleteApprovalMetadata(approvalMetadata),
      },
    };
  }

  private assertWriteAllowed(projectIdentifier: string): void {
    if (!this.writeGuard.canRegisterWriteTools()) {
      throw new AgentBriefLifecycleError(
        "writes_disabled",
        "Agent Brief lifecycle writes are disabled",
      );
    }

    if (!this.writeGuard.isProjectAllowed(projectIdentifier)) {
      throw new AgentBriefLifecycleError(
        "project_not_allowed",
        "Agent Brief lifecycle write is not allowed for this project",
      );
    }
  }
}

export function isAgentBriefLifecycleFieldName(name: string): boolean {
  return lifecycleFieldNames().includes(name);
}
