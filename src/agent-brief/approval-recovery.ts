import {
  AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
  type AgentBriefApprovalGenerationInputProjector,
  type AgentBriefApprovalLifecycleBoundary,
  type AgentBriefApprovalPersistedBriefReader,
  type AgentBriefApprovalRedmineReader,
  type AgentBriefApprovalStalenessDetector,
} from "./approval-handler.js";
import {
  projectAgentBriefGenerationInput,
  type AgentBriefGenerationInput,
  type GenerationInputProjectionPolicy,
} from "./generation-input.js";
import type {
  AgentBriefApprovalMetadata,
  AgentBriefApprovalMetadataSnapshot,
  AgentBriefLifecycleSnapshot,
  AgentBriefLifecycleTransitionRequest,
} from "./lifecycle-metadata.js";
import type { PersistedAgentBrief } from "./persistence.js";
import {
  detectAgentBriefRequirementsStaleness,
  type AgentBriefStalenessDetectionResult,
} from "./staleness-detection.js";
import {
  RedmineHttpError,
  RedmineNetworkError,
} from "../redmine/errors.js";
import type { RedmineIssue } from "../redmine/types.js";

export type AgentBriefApprovalRecoveryErrorCode =
  | "write_recovery_conflict"
  | "write_recovery_stale"
  | "write_recovery_unresolved"
  | "write_recovery_retry_exhausted";

export class AgentBriefApprovalRecoveryError extends Error {
  constructor(
    public readonly code: AgentBriefApprovalRecoveryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentBriefApprovalRecoveryError";
  }
}

export interface AgentBriefApprovalRecoveryOptions {
  repository: string;
  generationInputPolicy?: GenerationInputProjectionPolicy;
  projectGenerationInput?: AgentBriefApprovalGenerationInputProjector;
  detectStaleness?: AgentBriefApprovalStalenessDetector;
}

function recoveryError(
  code: AgentBriefApprovalRecoveryErrorCode,
  message: string,
): AgentBriefApprovalRecoveryError {
  return new AgentBriefApprovalRecoveryError(code, message);
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

function isAmbiguousTransportFailure(error: unknown): boolean {
  return (
    error instanceof RedmineNetworkError ||
    (error instanceof RedmineHttpError && error.status >= 500)
  );
}

function hasNoApprovalMetadata(
  metadata: AgentBriefApprovalMetadataSnapshot,
): boolean {
  return (
    metadata.approverIdentity === undefined &&
    metadata.approvedAt === undefined &&
    metadata.approvedBriefRevision === undefined &&
    metadata.approvedPersistedRevision === undefined &&
    metadata.approvedRequirementsFingerprint === undefined
  );
}

function approvalMetadataMatches(
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

function isCompletedTransition(
  snapshot: AgentBriefLifecycleSnapshot,
  request: AgentBriefLifecycleTransitionRequest,
): boolean {
  if (request.targetLifecycle === "Ready for Agent") {
    return (
      request.approvalMetadata !== undefined &&
      snapshot.lifecycle === "Ready for Agent" &&
      snapshot.handoffEligible &&
      approvalMetadataMatches(
        snapshot.approvalMetadata,
        request.approvalMetadata,
      )
    );
  }

  return (
    snapshot.lifecycle === request.targetLifecycle &&
    !snapshot.handoffEligible
  );
}

function hasExactPersistedReference(
  persistedBrief: PersistedAgentBrief,
  issueId: number,
  metadata: AgentBriefApprovalMetadata,
  repository: string,
): boolean {
  return (
    persistedBrief.repository === repository &&
    persistedBrief.redmineIssueId === issueId &&
    persistedBrief.briefRevision === metadata.approvedBriefRevision &&
    persistedBrief.persistedRevision === metadata.approvedPersistedRevision
  );
}

function stalenessMatchesApprovalTarget(
  result: Extract<
    AgentBriefStalenessDetectionResult,
    { kind: "CURRENT" | "STALE" }
  >,
  issueId: number,
  metadata: AgentBriefApprovalMetadata,
  repository: string,
): boolean {
  return (
    result.repository === repository &&
    result.redmineIssueId === issueId &&
    result.briefRevision === metadata.approvedBriefRevision &&
    result.persistedRevision === metadata.approvedPersistedRevision
  );
}

export class AgentBriefApprovalRecoveryLifecycleBoundary
  implements AgentBriefApprovalLifecycleBoundary
{
  private readonly repository: string;
  private readonly generationInputPolicy: GenerationInputProjectionPolicy;
  private readonly projectGenerationInput: AgentBriefApprovalGenerationInputProjector;
  private readonly detectStaleness: AgentBriefApprovalStalenessDetector;

  constructor(
    private readonly inner: AgentBriefApprovalLifecycleBoundary,
    private readonly redmineReader: AgentBriefApprovalRedmineReader,
    private readonly readPersistedBrief: AgentBriefApprovalPersistedBriefReader,
    options: AgentBriefApprovalRecoveryOptions,
  ) {
    if (options.repository.trim() === "") {
      throw new Error("Agent Brief approval recovery repository must not be blank");
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

  read(issueId: number): Promise<AgentBriefLifecycleSnapshot> {
    return this.inner.read(issueId);
  }

  async transition(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    try {
      return await this.inner.transition(issueId, request);
    } catch (error) {
      if (!isAmbiguousTransportFailure(error)) {
        throw error;
      }
    }

    const firstReadBack = await this.readBack(issueId);
    if (isCompletedTransition(firstReadBack, request)) {
      return firstReadBack;
    }

    if (request.targetLifecycle !== "Ready for Agent") {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief lifecycle write outcome could not be established safely.",
      );
    }

    if (
      firstReadBack.lifecycle !== "Brief Ready" ||
      firstReadBack.handoffEligible ||
      !hasNoApprovalMetadata(firstReadBack.approvalMetadata)
    ) {
      throw recoveryError(
        "write_recovery_conflict",
        "Agent Brief approval recovery found a conflicting lifecycle or approval state.",
      );
    }

    await this.revalidateApprovalRetry(issueId, request);

    try {
      return await this.inner.transition(issueId, request);
    } catch (error) {
      if (!isAmbiguousTransportFailure(error)) {
        throw error;
      }
    }

    const finalReadBack = await this.readBack(issueId);
    if (isCompletedTransition(finalReadBack, request)) {
      return finalReadBack;
    }

    throw recoveryError(
      "write_recovery_retry_exhausted",
      "Agent Brief approval recovery retry did not establish a safe final state.",
    );
  }

  private async readBack(
    issueId: number,
  ): Promise<AgentBriefLifecycleSnapshot> {
    try {
      return await this.inner.read(issueId);
    } catch {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief approval recovery read-back was unavailable.",
      );
    }
  }

  private async revalidateApprovalRetry(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<void> {
    const approvalMetadata = request.approvalMetadata;
    if (approvalMetadata === undefined) {
      throw recoveryError(
        "write_recovery_conflict",
        "Agent Brief approval recovery requires the original approval metadata.",
      );
    }

    const issue = await this.readLatestIssue(issueId);
    if (issue.id !== issueId) {
      throw recoveryError(
        "write_recovery_conflict",
        "Agent Brief approval recovery Issue identity changed before retry.",
      );
    }

    const persistedBrief = await this.readReviewedBrief(
      issueId,
      approvalMetadata.approvedBriefRevision,
    );
    if (
      !hasExactPersistedReference(
        persistedBrief,
        issueId,
        approvalMetadata,
        this.repository,
      )
    ) {
      throw recoveryError(
        "write_recovery_conflict",
        "Agent Brief approval recovery target no longer matches the reviewed persisted reference.",
      );
    }

    let generationInput: AgentBriefGenerationInput;
    try {
      generationInput = this.projectGenerationInput(
        issue,
        this.generationInputPolicy,
      );
    } catch {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief approval recovery could not project current requirements.",
      );
    }

    let staleness: AgentBriefStalenessDetectionResult;
    try {
      staleness = this.detectStaleness(persistedBrief, generationInput);
    } catch {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief approval recovery could not revalidate requirements.",
      );
    }

    if (
      staleness.kind === "STALE" &&
      stalenessMatchesApprovalTarget(
        staleness,
        issueId,
        approvalMetadata,
        this.repository,
      )
    ) {
      throw recoveryError(
        "write_recovery_stale",
        "Agent Brief approval became stale before the bounded recovery retry.",
      );
    }

    if (
      staleness.kind !== "CURRENT" ||
      !stalenessMatchesApprovalTarget(
        staleness,
        issueId,
        approvalMetadata,
        this.repository,
      ) ||
      staleness.currentFingerprint !==
        approvalMetadata.approvedRequirementsFingerprint
    ) {
      throw recoveryError(
        "write_recovery_conflict",
        "Agent Brief approval recovery could not prove the original approval target is still current.",
      );
    }
  }

  private async readLatestIssue(issueId: number): Promise<RedmineIssue> {
    try {
      return await this.redmineReader.getIssue(issueId, {
        include: AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
      });
    } catch {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief approval recovery could not load the latest Redmine Issue.",
      );
    }
  }

  private async readReviewedBrief(
    issueId: number,
    briefRevision: number,
  ): Promise<PersistedAgentBrief> {
    try {
      return await this.readPersistedBrief(issueId, briefRevision);
    } catch {
      throw recoveryError(
        "write_recovery_unresolved",
        "Agent Brief approval recovery could not load the reviewed persisted Brief.",
      );
    }
  }
}
