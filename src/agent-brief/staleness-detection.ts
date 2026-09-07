import { validateAgentBrief } from "./contract.js";
import type { AgentBriefGenerationInput } from "./generation-input.js";
import {
  calculateAgentBriefRequirementsFingerprint,
} from "./requirements-fingerprint.js";
import {
  agentBriefRevisionPath,
  type PersistedAgentBrief,
} from "./persistence.js";

export type AgentBriefStalenessDetectionResult =
  | {
      kind: "CURRENT";
      repository: string;
      redmineIssueId: number;
      briefRevision: number;
      persistedRevision: string;
      persistedFingerprint: string;
      currentFingerprint: string;
    }
  | {
      kind: "STALE";
      repository: string;
      redmineIssueId: number;
      briefRevision: number;
      persistedRevision: string;
      persistedFingerprint: string;
      currentFingerprint: string;
    }
  | {
      kind: "INVALID_REFERENCE";
      reason: string;
    }
  | {
      kind: "FINGERPRINT_UNAVAILABLE";
      reason: string;
    };

function invalidReference(reason: string): AgentBriefStalenessDetectionResult {
  return {
    kind: "INVALID_REFERENCE",
    reason,
  };
}

function fingerprintUnavailable(
  reason: string,
): AgentBriefStalenessDetectionResult {
  return {
    kind: "FINGERPRINT_UNAVAILABLE",
    reason,
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hasValidPersistedReference(
  persistedBrief: PersistedAgentBrief,
): boolean {
  return (
    persistedBrief.repository.trim() !== "" &&
    persistedBrief.artifactPath.trim() !== "" &&
    isPositiveSafeInteger(persistedBrief.redmineIssueId) &&
    isPositiveSafeInteger(persistedBrief.briefRevision) &&
    persistedBrief.persistedRevision.trim() !== "" &&
    persistedBrief.artifactPath ===
      agentBriefRevisionPath(
        persistedBrief.redmineIssueId,
        persistedBrief.briefRevision,
      )
  );
}

export function detectAgentBriefRequirementsStaleness(
  persistedBrief: PersistedAgentBrief,
  currentGenerationInput: AgentBriefGenerationInput,
): AgentBriefStalenessDetectionResult {
  if (!hasValidPersistedReference(persistedBrief)) {
    return invalidReference(
      "Persisted Agent Brief reference metadata is incomplete or invalid.",
    );
  }

  const validation = validateAgentBrief(persistedBrief.markdown);
  if (!validation.success) {
    return invalidReference(
      "Persisted Agent Brief does not satisfy the canonical artifact contract.",
    );
  }

  const metadata = validation.data.metadata;
  if (
    metadata.repository === undefined ||
    metadata.repository !== persistedBrief.repository ||
    metadata.redmine_issue_id !== persistedBrief.redmineIssueId ||
    metadata.brief_revision !== persistedBrief.briefRevision
  ) {
    return invalidReference(
      "Persisted Agent Brief metadata does not match its persistence reference.",
    );
  }

  if (
    currentGenerationInput.source.redmine_issue_id !==
    metadata.redmine_issue_id
  ) {
    return invalidReference(
      "Current requirements do not belong to the persisted Agent Brief Issue.",
    );
  }

  let currentFingerprint: string;
  try {
    currentFingerprint =
      calculateAgentBriefRequirementsFingerprint(currentGenerationInput);
  } catch {
    return fingerprintUnavailable(
      "Current requirements fingerprint could not be calculated.",
    );
  }

  const baseResult = {
    repository: persistedBrief.repository,
    redmineIssueId: persistedBrief.redmineIssueId,
    briefRevision: persistedBrief.briefRevision,
    persistedRevision: persistedBrief.persistedRevision,
    persistedFingerprint: metadata.requirements_fingerprint,
    currentFingerprint,
  };

  if (currentFingerprint === metadata.requirements_fingerprint) {
    return {
      kind: "CURRENT",
      ...baseResult,
    };
  }

  return {
    kind: "STALE",
    ...baseResult,
  };
}
