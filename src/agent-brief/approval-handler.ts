import {
  projectAgentBriefGenerationInput,
  type AgentBriefGenerationInput,
  type GenerationInputProjectionPolicy,
} from "./generation-input.js";
import {
  AgentBriefLifecycleError,
  type AgentBriefApprovalMetadata,
  type AgentBriefLifecycleSnapshot,
  type AgentBriefLifecycleTransitionRequest,
} from "./lifecycle-metadata.js";
import {
  AgentBriefPersistenceError,
  type PersistedAgentBrief,
} from "./persistence.js";
import {
  detectAgentBriefRequirementsStaleness,
  type AgentBriefStalenessDetectionResult,
} from "./staleness-detection.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineUser,
} from "../redmine/types.js";

export const AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES = [
  "journals",
  "relations",
  "children",
] as const satisfies readonly RedmineIssueInclude[];

export interface AgentBriefApprovalRequest {
  issueId: number;
  briefRevision: number;
  persistedRevision: string;
}

export type AgentBriefApprovalValidationFailureReason =
  | "lifecycle_not_brief_ready"
  | "reviewed_reference_invalid"
  | "fingerprint_unavailable";

export type AgentBriefApprovalHandlerResult =
  | {
      outcome: "approved";
      issueId: number;
      briefRevision: number;
      persistedRevision: string;
      requirementsFingerprint: string;
      lifecycle: "Ready for Agent";
      approverIdentity: string;
      approvedAt: string;
      handoffEligible: true;
    }
  | {
      outcome: "stale";
      issueId: number;
      briefRevision: number;
      persistedRevision: string;
      persistedRequirementsFingerprint: string;
      currentRequirementsFingerprint: string;
      lifecycle: "Brief Draft";
      handoffEligible: false;
    }
  | {
      outcome: "validation_failed";
      issueId: number;
      briefRevision: number;
      persistedRevision: string;
      reason: AgentBriefApprovalValidationFailureReason;
      handoffEligible: false;
    };

export type AgentBriefApprovalHandlerErrorCode =
  | "invalid_request"
  | "approval_clock_failed"
  | "issue_read_failed"
  | "lifecycle_read_failed"
  | "persistence_read_failed"
  | "requirements_projection_failed"
  | "staleness_detection_failed"
  | "approver_lookup_failed"
  | "writes_disabled"
  | "project_not_allowed"
  | "lifecycle_transition_failed"
  | "approval_readback_mismatch";

export class AgentBriefApprovalHandlerError extends Error {
  constructor(
    public readonly code: AgentBriefApprovalHandlerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentBriefApprovalHandlerError";
  }
}

export interface AgentBriefApprovalRedmineReader {
  getIssue(
    issueId: number,
    options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue>;
  getCurrentUser(): Promise<RedmineUser>;
}

export interface AgentBriefApprovalLifecycleBoundary {
  read(issueId: number): Promise<AgentBriefLifecycleSnapshot>;
  transition(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot>;
}

export type AgentBriefApprovalPersistedBriefReader = (
  issueId: number,
  briefRevision: number,
) => Promise<PersistedAgentBrief>;

export type AgentBriefApprovalGenerationInputProjector = (
  issue: RedmineIssue,
  policy?: GenerationInputProjectionPolicy,
) => AgentBriefGenerationInput;

export type AgentBriefApprovalStalenessDetector = (
  persistedBrief: PersistedAgentBrief,
  currentGenerationInput: AgentBriefGenerationInput,
) => AgentBriefStalenessDetectionResult;

export interface AgentBriefApprovalHandlerOptions {
  generationInputPolicy?: GenerationInputProjectionPolicy;
  clock?: () => string;
  projectGenerationInput?: AgentBriefApprovalGenerationInputProjector;
  detectStaleness?: AgentBriefApprovalStalenessDetector;
}

const RFC_3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function handlerError(
  code: AgentBriefApprovalHandlerErrorCode,
  message: string,
): AgentBriefApprovalHandlerError {
  return new AgentBriefApprovalHandlerError(code, message);
}

function validationFailed(
  request: AgentBriefApprovalRequest,
  reason: AgentBriefApprovalValidationFailureReason,
): AgentBriefApprovalHandlerResult {
  return {
    outcome: "validation_failed",
    issueId: request.issueId,
    briefRevision: request.briefRevision,
    persistedRevision: request.persistedRevision,
    reason,
    handoffEligible: false,
  };
}

function assertApprovalRequest(request: AgentBriefApprovalRequest): void {
  if (!Number.isSafeInteger(request.issueId) || request.issueId <= 0) {
    throw handlerError(
      "invalid_request",
      "Agent Brief approval issueId must be a positive safe integer.",
    );
  }

  if (
    !Number.isSafeInteger(request.briefRevision) ||
    request.briefRevision <= 0
  ) {
    throw handlerError(
      "invalid_request",
      "Agent Brief approval briefRevision must be a positive safe integer.",
    );
  }

  if (request.persistedRevision.trim() === "") {
    throw handlerError(
      "invalid_request",
      "Agent Brief approval persistedRevision must not be blank.",
    );
  }
}

function normalizeGenerationInputPolicy(
  policy: GenerationInputProjectionPolicy | undefined,
): GenerationInputProjectionPolicy {
  if (policy === undefined) {
    return {};
  }

  return {
    ...(policy.requirementCustomFieldIds === undefined
      ? {}
      : {
          requirementCustomFieldIds: [
            ...policy.requirementCustomFieldIds,
          ],
        }),
    ...(policy.configuredSecrets === undefined
      ? {}
      : {
          configuredSecrets: [...policy.configuredSecrets],
        }),
  };
}

function isReviewedReferencePersistenceError(
  error: AgentBriefPersistenceError,
): boolean {
  return (
    error.code === "artifact_not_found" ||
    error.code === "stored_identity_mismatch" ||
    error.code === "invalid_brief" ||
    error.code === "unsupported_storage_target" ||
    error.code === "storage_target_mismatch"
  );
}

function lifecycleTransitionError(
  error: unknown,
): AgentBriefApprovalHandlerError {
  if (error instanceof AgentBriefLifecycleError) {
    if (error.code === "writes_disabled") {
      return handlerError(
        "writes_disabled",
        "Agent Brief approval writes are disabled.",
      );
    }

    if (error.code === "project_not_allowed") {
      return handlerError(
        "project_not_allowed",
        "Agent Brief approval is not allowed for this project.",
      );
    }

    if (error.code === "approval_reference_mismatch") {
      return handlerError(
        "approval_readback_mismatch",
        "Agent Brief approval lifecycle read-back did not match the requested transition.",
      );
    }
  }

  return handlerError(
    "lifecycle_transition_failed",
    "Agent Brief approval lifecycle transition failed.",
  );
}

function hasExactPersistedReference(
  persistedBrief: PersistedAgentBrief,
  request: AgentBriefApprovalRequest,
): boolean {
  return (
    persistedBrief.redmineIssueId === request.issueId &&
    persistedBrief.briefRevision === request.briefRevision &&
    persistedBrief.persistedRevision === request.persistedRevision
  );
}

function stalenessResultMatchesReviewedReference(
  result: Extract<
    AgentBriefStalenessDetectionResult,
    { kind: "CURRENT" | "STALE" }
  >,
  request: AgentBriefApprovalRequest,
  persistedBrief: PersistedAgentBrief,
): boolean {
  return (
    result.repository === persistedBrief.repository &&
    result.redmineIssueId === request.issueId &&
    result.briefRevision === request.briefRevision &&
    result.persistedRevision === request.persistedRevision
  );
}

function isApprovalMetadataMatch(
  actual: AgentBriefLifecycleSnapshot["approvalMetadata"],
  expected: AgentBriefApprovalMetadata,
): boolean {
  return (
    actual.approverIdentity === expected.approverIdentity &&
    actual.approvedAt === expected.approvedAt &&
    actual.approvedBriefRevision === expected.approvedBriefRevision &&
    actual.approvedPersistedRevision ===
      expected.approvedPersistedRevision &&
    actual.approvedRequirementsFingerprint ===
      expected.approvedRequirementsFingerprint
  );
}

export class AgentBriefApprovalHandler {
  private readonly generationInputPolicy: GenerationInputProjectionPolicy;
  private readonly clock: () => string;
  private readonly projectGenerationInput: AgentBriefApprovalGenerationInputProjector;
  private readonly detectStaleness: AgentBriefApprovalStalenessDetector;

  constructor(
    private readonly redmineReader: AgentBriefApprovalRedmineReader,
    private readonly lifecycleBoundary: AgentBriefApprovalLifecycleBoundary,
    private readonly readPersistedBrief: AgentBriefApprovalPersistedBriefReader,
    options: AgentBriefApprovalHandlerOptions = {},
  ) {
    this.generationInputPolicy = normalizeGenerationInputPolicy(
      options.generationInputPolicy,
    );
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.projectGenerationInput =
      options.projectGenerationInput ?? projectAgentBriefGenerationInput;
    this.detectStaleness =
      options.detectStaleness ?? detectAgentBriefRequirementsStaleness;
  }

  async approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalHandlerResult> {
    assertApprovalRequest(request);

    const approvedAt = this.captureApprovalTimestamp();
    const latestIssue = await this.readLatestIssue(request.issueId);

    if (latestIssue.id !== request.issueId) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    const lifecycle = await this.readLifecycle(request.issueId);
    if (
      lifecycle.issueId !== request.issueId ||
      lifecycle.projectId !== latestIssue.project.id
    ) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (lifecycle.lifecycle !== "Brief Ready") {
      return validationFailed(request, "lifecycle_not_brief_ready");
    }

    const persistedBriefResult = await this.readReviewedBrief(request);
    if (persistedBriefResult === undefined) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (!hasExactPersistedReference(persistedBriefResult, request)) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    const generationInput = this.projectCurrentRequirements(latestIssue);
    const staleness = this.detectRequirementsStaleness(
      persistedBriefResult,
      generationInput,
    );

    if (staleness.kind === "INVALID_REFERENCE") {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (staleness.kind === "FINGERPRINT_UNAVAILABLE") {
      return validationFailed(request, "fingerprint_unavailable");
    }

    if (
      !stalenessResultMatchesReviewedReference(
        staleness,
        request,
        persistedBriefResult,
      )
    ) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (staleness.kind === "STALE") {
      return this.resetStaleBrief(request, staleness);
    }

    return this.approveCurrentBrief(request, staleness, approvedAt);
  }

  private captureApprovalTimestamp(): string {
    let timestamp: string;

    try {
      timestamp = this.clock();
    } catch {
      throw handlerError(
        "approval_clock_failed",
        "Agent Brief approval timestamp could not be captured.",
      );
    }

    if (
      !RFC_3339_PATTERN.test(timestamp) ||
      Number.isNaN(Date.parse(timestamp))
    ) {
      throw handlerError(
        "approval_clock_failed",
        "Agent Brief approval timestamp could not be captured.",
      );
    }

    return timestamp;
  }

  private async readLatestIssue(issueId: number): Promise<RedmineIssue> {
    try {
      return await this.redmineReader.getIssue(issueId, {
        include: AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
      });
    } catch {
      throw handlerError(
        "issue_read_failed",
        "Current Redmine Issue could not be loaded for Agent Brief approval.",
      );
    }
  }

  private async readLifecycle(
    issueId: number,
  ): Promise<AgentBriefLifecycleSnapshot> {
    try {
      return await this.lifecycleBoundary.read(issueId);
    } catch {
      throw handlerError(
        "lifecycle_read_failed",
        "Agent Brief lifecycle could not be loaded for approval.",
      );
    }
  }

  private async readReviewedBrief(
    request: AgentBriefApprovalRequest,
  ): Promise<PersistedAgentBrief | undefined> {
    try {
      return await this.readPersistedBrief(
        request.issueId,
        request.briefRevision,
      );
    } catch (error) {
      if (
        error instanceof AgentBriefPersistenceError &&
        isReviewedReferencePersistenceError(error)
      ) {
        return undefined;
      }

      throw handlerError(
        "persistence_read_failed",
        "Reviewed Agent Brief could not be loaded from persistence.",
      );
    }
  }

  private projectCurrentRequirements(
    issue: RedmineIssue,
  ): AgentBriefGenerationInput {
    try {
      return this.projectGenerationInput(
        issue,
        this.generationInputPolicy,
      );
    } catch {
      throw handlerError(
        "requirements_projection_failed",
        "Current Redmine requirements could not be projected for approval validation.",
      );
    }
  }

  private detectRequirementsStaleness(
    persistedBrief: PersistedAgentBrief,
    generationInput: AgentBriefGenerationInput,
  ): AgentBriefStalenessDetectionResult {
    try {
      return this.detectStaleness(persistedBrief, generationInput);
    } catch {
      throw handlerError(
        "staleness_detection_failed",
        "Agent Brief requirements staleness detection failed.",
      );
    }
  }

  private async resolveApproverIdentity(): Promise<string> {
    let user: RedmineUser;

    try {
      user = await this.redmineReader.getCurrentUser();
    } catch {
      throw handlerError(
        "approver_lookup_failed",
        "Authenticated Redmine approver identity could not be resolved.",
      );
    }

    if (!Number.isSafeInteger(user.id) || user.id <= 0) {
      throw handlerError(
        "approver_lookup_failed",
        "Authenticated Redmine approver identity could not be resolved.",
      );
    }

    return `redmine-user:${user.id}`;
  }

  private async transitionLifecycle(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    try {
      return await this.lifecycleBoundary.transition(issueId, request);
    } catch (error) {
      throw lifecycleTransitionError(error);
    }
  }

  private async resetStaleBrief(
    request: AgentBriefApprovalRequest,
    staleness: Extract<
      AgentBriefStalenessDetectionResult,
      { kind: "STALE" }
    >,
  ): Promise<AgentBriefApprovalHandlerResult> {
    const snapshot = await this.transitionLifecycle(request.issueId, {
      targetLifecycle: "Brief Draft",
    });

    if (
      snapshot.issueId !== request.issueId ||
      snapshot.lifecycle !== "Brief Draft" ||
      snapshot.handoffEligible
    ) {
      throw handlerError(
        "approval_readback_mismatch",
        "Stale Agent Brief lifecycle read-back did not prove a safe Brief Draft state.",
      );
    }

    return {
      outcome: "stale",
      issueId: request.issueId,
      briefRevision: request.briefRevision,
      persistedRevision: request.persistedRevision,
      persistedRequirementsFingerprint:
        staleness.persistedFingerprint,
      currentRequirementsFingerprint: staleness.currentFingerprint,
      lifecycle: "Brief Draft",
      handoffEligible: false,
    };
  }

  private async approveCurrentBrief(
    request: AgentBriefApprovalRequest,
    staleness: Extract<
      AgentBriefStalenessDetectionResult,
      { kind: "CURRENT" }
    >,
    approvedAt: string,
  ): Promise<AgentBriefApprovalHandlerResult> {
    const approverIdentity = await this.resolveApproverIdentity();
    const approvalMetadata: AgentBriefApprovalMetadata = {
      approverIdentity,
      approvedAt,
      approvedBriefRevision: request.briefRevision,
      approvedPersistedRevision: request.persistedRevision,
      approvedRequirementsFingerprint: staleness.currentFingerprint,
    };

    const snapshot = await this.transitionLifecycle(request.issueId, {
      targetLifecycle: "Ready for Agent",
      approvalMetadata,
    });

    if (
      snapshot.issueId !== request.issueId ||
      snapshot.lifecycle !== "Ready for Agent" ||
      !snapshot.handoffEligible ||
      !isApprovalMetadataMatch(
        snapshot.approvalMetadata,
        approvalMetadata,
      )
    ) {
      throw handlerError(
        "approval_readback_mismatch",
        "Agent Brief approval read-back did not prove the requested approved state.",
      );
    }

    return {
      outcome: "approved",
      issueId: request.issueId,
      briefRevision: request.briefRevision,
      persistedRevision: request.persistedRevision,
      requirementsFingerprint: staleness.currentFingerprint,
      lifecycle: "Ready for Agent",
      approverIdentity,
      approvedAt,
      handoffEligible: true,
    };
  }
}
