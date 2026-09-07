import {
  AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
  AgentBriefApprovalHandlerError,
  type AgentBriefApprovalHandlerResult,
  type AgentBriefApprovalLifecycleBoundary,
  type AgentBriefApprovalPersistedBriefReader,
  type AgentBriefApprovalRedmineReader,
  type AgentBriefApprovalRequest,
  type AgentBriefApprovalStalenessDetector,
  type AgentBriefApprovalGenerationInputProjector,
} from "./approval-handler.js";
import {
  projectAgentBriefGenerationInput,
  type AgentBriefGenerationInput,
  type GenerationInputProjectionPolicy,
} from "./generation-input.js";
import type {
  AgentBriefApprovalMetadataSnapshot,
  AgentBriefLifecycleSnapshot,
} from "./lifecycle-metadata.js";
import {
  AgentBriefPersistenceError,
  type PersistedAgentBrief,
} from "./persistence.js";
import {
  detectAgentBriefRequirementsStaleness,
  type AgentBriefStalenessDetectionResult,
} from "./staleness-detection.js";
import type { RedmineIssue } from "../redmine/types.js";

export type AgentBriefApprovalIdempotentResult =
  | AgentBriefApprovalHandlerResult
  | {
      outcome: "validation_failed";
      issueId: number;
      briefRevision: number;
      persistedRevision: string;
      reason: "approval_conflict";
      handoffEligible: false;
    };

export interface AgentBriefApprovalPhase40Delegate {
  approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalHandlerResult>;
}

export interface AgentBriefApprovalIdempotencyOptions {
  repository: string;
  generationInputPolicy?: GenerationInputProjectionPolicy;
  projectGenerationInput?: AgentBriefApprovalGenerationInputProjector;
  detectStaleness?: AgentBriefApprovalStalenessDetector;
}

function handlerError(
  code: AgentBriefApprovalHandlerError["code"],
  message: string,
): AgentBriefApprovalHandlerError {
  return new AgentBriefApprovalHandlerError(code, message);
}

function validationFailed(
  request: AgentBriefApprovalRequest,
  reason:
    | "lifecycle_not_brief_ready"
    | "reviewed_reference_invalid"
    | "fingerprint_unavailable"
    | "approval_conflict",
): AgentBriefApprovalIdempotentResult {
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

function hasExactPersistedReference(
  persistedBrief: PersistedAgentBrief,
  request: AgentBriefApprovalRequest,
  repository: string,
): boolean {
  return (
    persistedBrief.repository === repository &&
    persistedBrief.redmineIssueId === request.issueId &&
    persistedBrief.briefRevision === request.briefRevision &&
    persistedBrief.persistedRevision === request.persistedRevision
  );
}

function stalenessMatchesTarget(
  result: Extract<
    AgentBriefStalenessDetectionResult,
    { kind: "CURRENT" | "STALE" }
  >,
  persistedBrief: PersistedAgentBrief,
  request: AgentBriefApprovalRequest,
  repository: string,
): boolean {
  return (
    result.repository === repository &&
    result.repository === persistedBrief.repository &&
    result.redmineIssueId === request.issueId &&
    result.briefRevision === request.briefRevision &&
    result.persistedRevision === request.persistedRevision
  );
}

function hasCompleteExactApprovalMetadata(
  metadata: AgentBriefApprovalMetadataSnapshot,
  request: AgentBriefApprovalRequest,
  fingerprint: string,
): metadata is Required<AgentBriefApprovalMetadataSnapshot> {
  return (
    metadata.approverIdentity !== undefined &&
    metadata.approvedAt !== undefined &&
    metadata.approvedBriefRevision === request.briefRevision &&
    metadata.approvedPersistedRevision === request.persistedRevision &&
    metadata.approvedRequirementsFingerprint === fingerprint
  );
}

export class AgentBriefApprovalIdempotencyHandler {
  private readonly repository: string;
  private readonly generationInputPolicy: GenerationInputProjectionPolicy;
  private readonly projectGenerationInput: AgentBriefApprovalGenerationInputProjector;
  private readonly detectStaleness: AgentBriefApprovalStalenessDetector;

  constructor(
    private readonly phase40Handler: AgentBriefApprovalPhase40Delegate,
    private readonly redmineReader: AgentBriefApprovalRedmineReader,
    private readonly lifecycleBoundary: AgentBriefApprovalLifecycleBoundary,
    private readonly readPersistedBrief: AgentBriefApprovalPersistedBriefReader,
    options: AgentBriefApprovalIdempotencyOptions,
  ) {
    if (options.repository.trim() === "") {
      throw new Error("Agent Brief approval repository must not be blank");
    }

    this.repository = options.repository;
    this.generationInputPolicy = normalizeGenerationInputPolicy(
      options.generationInputPolicy,
    );
    this.projectGenerationInput =
      options.projectGenerationInput ?? projectAgentBriefGenerationInput;
    this.detectStaleness =
      options.detectStaleness ?? detectAgentBriefRequirementsStaleness;
  }

  async approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalIdempotentResult> {
    assertApprovalRequest(request);

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

    if (lifecycle.lifecycle === "Brief Ready") {
      return this.phase40Handler.approve(request);
    }

    const persistedBrief = await this.readReviewedBrief(request);
    if (
      persistedBrief === undefined ||
      !hasExactPersistedReference(
        persistedBrief,
        request,
        this.repository,
      )
    ) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    const generationInput = this.projectCurrentRequirements(latestIssue);
    const staleness = this.detectRequirementsStaleness(
      persistedBrief,
      generationInput,
    );

    if (staleness.kind === "INVALID_REFERENCE") {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (staleness.kind === "FINGERPRINT_UNAVAILABLE") {
      return validationFailed(request, "fingerprint_unavailable");
    }

    if (
      !stalenessMatchesTarget(
        staleness,
        persistedBrief,
        request,
        this.repository,
      )
    ) {
      return validationFailed(request, "reviewed_reference_invalid");
    }

    if (lifecycle.lifecycle === "Brief Draft") {
      if (staleness.kind === "STALE") {
        return this.staleResult(request, staleness);
      }

      return validationFailed(request, "lifecycle_not_brief_ready");
    }

    return this.reconcileReadyForAgent(
      request,
      lifecycle,
      staleness,
    );
  }

  private async readLatestIssue(issueId: number): Promise<RedmineIssue> {
    try {
      return await this.redmineReader.getIssue(issueId, {
        include: AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
      });
    } catch {
      throw handlerError(
        "issue_read_failed",
        "Current Redmine Issue could not be loaded for Agent Brief approval reconciliation.",
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
        "Agent Brief lifecycle could not be loaded for approval reconciliation.",
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
        "Reviewed Agent Brief could not be loaded for approval reconciliation.",
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
        "Current Redmine requirements could not be projected for approval reconciliation.",
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
        "Agent Brief requirements staleness detection failed during approval reconciliation.",
      );
    }
  }

  private staleResult(
    request: AgentBriefApprovalRequest,
    staleness: Extract<
      AgentBriefStalenessDetectionResult,
      { kind: "STALE" }
    >,
  ): AgentBriefApprovalIdempotentResult {
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

  private reconcileReadyForAgent(
    request: AgentBriefApprovalRequest,
    lifecycle: AgentBriefLifecycleSnapshot,
    staleness: Extract<
      AgentBriefStalenessDetectionResult,
      { kind: "CURRENT" | "STALE" }
    >,
  ): AgentBriefApprovalIdempotentResult {
    if (
      staleness.kind !== "CURRENT" ||
      !lifecycle.handoffEligible ||
      !hasCompleteExactApprovalMetadata(
        lifecycle.approvalMetadata,
        request,
        staleness.currentFingerprint,
      )
    ) {
      return validationFailed(request, "approval_conflict");
    }

    return {
      outcome: "approved",
      issueId: request.issueId,
      briefRevision: request.briefRevision,
      persistedRevision: request.persistedRevision,
      requirementsFingerprint: staleness.currentFingerprint,
      lifecycle: "Ready for Agent",
      approverIdentity: lifecycle.approvalMetadata.approverIdentity,
      approvedAt: lifecycle.approvalMetadata.approvedAt,
      handoffEligible: true,
    };
  }
}
