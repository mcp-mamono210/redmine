import { describe, expect, it } from "vitest";

import {
  AgentBriefApprovalRecoveryError,
  AgentBriefApprovalRecoveryLifecycleBoundary,
} from "../../src/agent-brief/approval-recovery.js";
import type {
  AgentBriefApprovalLifecycleBoundary,
  AgentBriefApprovalPersistedBriefReader,
  AgentBriefApprovalRedmineReader,
} from "../../src/agent-brief/approval-handler.js";
import type {
  AgentBriefLifecycleSnapshot,
  AgentBriefLifecycleTransitionRequest,
} from "../../src/agent-brief/lifecycle-metadata.js";
import type { PersistedAgentBrief } from "../../src/agent-brief/persistence.js";
import { RedmineNetworkError } from "../../src/redmine/errors.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineUser,
} from "../../src/redmine/types.js";

const ISSUE_ID = 5375;
const BRIEF_REVISION = 1;
const PERSISTED_REVISION = "persisted-5375";
const REPOSITORY = "mcp-mamono210/redmine";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const APPROVED_AT = "2026-09-07T14:40:00Z";

const approvalMetadata = {
  approverIdentity: "redmine-user:3",
  approvedAt: APPROVED_AT,
  approvedBriefRevision: BRIEF_REVISION,
  approvedPersistedRevision: PERSISTED_REVISION,
  approvedRequirementsFingerprint: FINGERPRINT,
} as const;

const transitionRequest: AgentBriefLifecycleTransitionRequest = {
  targetLifecycle: "Ready for Agent",
  approvalMetadata,
};

function issueFixture(description = "current requirements"): RedmineIssue {
  return {
    id: ISSUE_ID,
    project: { id: 414, name: "Redmine" },
    tracker: { id: 2, name: "Feature" },
    status: { id: 1, name: "New" },
    priority: { id: 2, name: "Normal" },
    author: { id: 10, name: "Chat GPT" },
    subject: "Phase 41-3 recovery",
    description,
    customFields: [],
  };
}

function briefReady(): AgentBriefLifecycleSnapshot {
  return {
    issueId: ISSUE_ID,
    projectId: 414,
    projectName: "Redmine",
    lifecycle: "Brief Ready",
    approvalMetadata: {},
    handoffEligible: false,
  };
}

function approved(): AgentBriefLifecycleSnapshot {
  return {
    issueId: ISSUE_ID,
    projectId: 414,
    projectName: "Redmine",
    lifecycle: "Ready for Agent",
    approvalMetadata: { ...approvalMetadata },
    handoffEligible: true,
  };
}

function persistedBrief(): PersistedAgentBrief {
  return {
    repository: REPOSITORY,
    artifactPath:
      `docs/agent-briefs/${ISSUE_ID}/revisions/${BRIEF_REVISION}.md`,
    redmineIssueId: ISSUE_ID,
    briefRevision: BRIEF_REVISION,
    persistedRevision: PERSISTED_REVISION,
    markdown: "fixture",
  };
}

class FakeReader implements AgentBriefApprovalRedmineReader {
  issueCalls = 0;

  constructor(public issue: RedmineIssue = issueFixture()) {}

  getIssue(
    _issueId: number,
    _options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue> {
    this.issueCalls += 1;
    return Promise.resolve(structuredClone(this.issue));
  }

  getCurrentUser(): Promise<RedmineUser> {
    return Promise.resolve({
      id: 3,
      login: "mamono210",
      firstname: "Mamono",
      lastname: "210",
    });
  }
}

class FakeBoundary implements AgentBriefApprovalLifecycleBoundary {
  transitionCalls: AgentBriefLifecycleTransitionRequest[] = [];
  readCalls = 0;
  transitionPlan: Array<"network" | "success"> = [];

  constructor(public snapshot: AgentBriefLifecycleSnapshot = briefReady()) {}

  read(_issueId: number): Promise<AgentBriefLifecycleSnapshot> {
    this.readCalls += 1;
    return Promise.resolve(structuredClone(this.snapshot));
  }

  transition(
    _issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    this.transitionCalls.push(structuredClone(request));
    const action = this.transitionPlan.shift() ?? "success";

    if (action === "network") {
      return Promise.reject(
        new RedmineNetworkError(
          "response unavailable",
          "PUT",
          `/issues/${ISSUE_ID}.json`,
        ),
      );
    }

    this.snapshot = approved();
    return Promise.resolve(structuredClone(this.snapshot));
  }
}

function recoveryFixture(options?: {
  boundary?: FakeBoundary;
  reader?: FakeReader;
  stale?: boolean;
  persisted?: PersistedAgentBrief;
}) {
  const boundary = options?.boundary ?? new FakeBoundary();
  const reader = options?.reader ?? new FakeReader();
  const persisted = options?.persisted ?? persistedBrief();
  const readPersistedBrief: AgentBriefApprovalPersistedBriefReader = () =>
    Promise.resolve(structuredClone(persisted));

  const recovery = new AgentBriefApprovalRecoveryLifecycleBoundary(
    boundary,
    reader,
    readPersistedBrief,
    {
      repository: REPOSITORY,
      projectGenerationInput: (issue) => ({
        format_version: 1,
        source: {
          redmine_issue_id: issue.id,
          source_updated_on: "2026-09-07T14:00:00Z",
          project: { ...issue.project },
          tracker: { ...issue.tracker },
          subject: issue.subject,
          description: issue.description ?? "",
        },
        requirement_custom_fields: [],
        journal_notes: [],
        relations: [],
        children: [],
        projection: {
          requirement_custom_field_ids: [],
          redacted_paths: [],
          truncated_paths: [],
          omitted: {
            requirement_custom_fields: 0,
            journal_notes: 0,
            relations: 0,
            children: 0,
          },
        },
      }),
      detectStaleness: () =>
        options?.stale
          ? {
              kind: "STALE",
              repository: REPOSITORY,
              redmineIssueId: ISSUE_ID,
              briefRevision: BRIEF_REVISION,
              persistedRevision: PERSISTED_REVISION,
              persistedFingerprint: FINGERPRINT,
              currentFingerprint: `sha256:${"b".repeat(64)}`,
            }
          : {
              kind: "CURRENT",
              repository: REPOSITORY,
              redmineIssueId: ISSUE_ID,
              briefRevision: BRIEF_REVISION,
              persistedRevision: PERSISTED_REVISION,
              persistedFingerprint: FINGERPRINT,
              currentFingerprint: FINGERPRINT,
            },
    },
  );

  return { recovery, boundary, reader };
}

async function expectRecoveryError(
  promise: Promise<unknown>,
  code: AgentBriefApprovalRecoveryError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "AgentBriefApprovalRecoveryError",
    code,
  });
}

describe("AgentBriefApprovalRecoveryLifecycleBoundary", () => {
  it("reconciles a committed write after response loss without a duplicate write", async () => {
    const boundary = new FakeBoundary(approved());
    boundary.transitionPlan = ["network"];
    const { recovery } = recoveryFixture({ boundary });

    await expect(
      recovery.transition(ISSUE_ID, transitionRequest),
    ).resolves.toEqual(approved());
    expect(boundary.transitionCalls).toHaveLength(1);
    expect(boundary.readCalls).toBe(1);
  });

  it("revalidates and performs at most one recovery write when the first write did not commit", async () => {
    const boundary = new FakeBoundary(briefReady());
    boundary.transitionPlan = ["network", "success"];
    const { recovery, reader } = recoveryFixture({ boundary });

    await expect(
      recovery.transition(ISSUE_ID, transitionRequest),
    ).resolves.toEqual(approved());
    expect(boundary.transitionCalls).toHaveLength(2);
    expect(reader.issueCalls).toBe(1);
    expect(boundary.transitionCalls[0]).toEqual(
      boundary.transitionCalls[1],
    );
  });

  it("does not retry when requirements became stale before recovery", async () => {
    const boundary = new FakeBoundary(briefReady());
    boundary.transitionPlan = ["network"];
    const { recovery } = recoveryFixture({ boundary, stale: true });

    await expectRecoveryError(
      recovery.transition(ISSUE_ID, transitionRequest),
      "write_recovery_stale",
    );
    expect(boundary.transitionCalls).toHaveLength(1);
  });

  it("does not retry a partial or conflicting approval state", async () => {
    const boundary = new FakeBoundary({
      ...approved(),
      approvalMetadata: {
        ...approvalMetadata,
        approvedPersistedRevision: "different",
      },
    });
    boundary.transitionPlan = ["network"];
    const { recovery } = recoveryFixture({ boundary });

    await expectRecoveryError(
      recovery.transition(ISSUE_ID, transitionRequest),
      "write_recovery_conflict",
    );
    expect(boundary.transitionCalls).toHaveLength(1);
  });

  it("stops after the one bounded recovery retry and never attempts write number three", async () => {
    const boundary = new FakeBoundary(briefReady());
    boundary.transitionPlan = ["network", "network"];
    const { recovery } = recoveryFixture({ boundary });

    await expectRecoveryError(
      recovery.transition(ISSUE_ID, transitionRequest),
      "write_recovery_retry_exhausted",
    );
    expect(boundary.transitionCalls).toHaveLength(2);
  });

  it("does not expose a nested transport credential in recovery diagnostics", async () => {
    const secret = "super-secret-redmine-key";
    const boundary = new FakeBoundary(briefReady());
    boundary.transition = () =>
      Promise.reject(
        new RedmineNetworkError(
          `failed with ${secret}`,
          "PUT",
          `/issues/${ISSUE_ID}.json`,
        ),
      );
    const { recovery } = recoveryFixture({ boundary, stale: true });

    try {
      await recovery.transition(ISSUE_ID, transitionRequest);
      throw new Error("Expected recovery to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentBriefApprovalRecoveryError);
      expect(String(error)).not.toContain(secret);
    }
  });
});
