import { describe, expect, it } from "vitest";

import type {
  AgentBriefApprovalHandlerResult,
  AgentBriefApprovalLifecycleBoundary,
  AgentBriefApprovalRedmineReader,
  AgentBriefApprovalRequest,
} from "../../src/agent-brief/approval-handler.js";
import {
  AgentBriefApprovalIdempotencyHandler,
  type AgentBriefApprovalPhase40Delegate,
} from "../../src/agent-brief/approval-idempotency.js";
import type {
  AgentBriefLifecycleSnapshot,
  AgentBriefLifecycleTransitionRequest,
} from "../../src/agent-brief/lifecycle-metadata.js";
import type { PersistedAgentBrief } from "../../src/agent-brief/persistence.js";
import type { RedmineIssue, RedmineUser } from "../../src/redmine/types.js";

const ISSUE_ID = 5374;
const BRIEF_REVISION = 2;
const PERSISTED_REVISION = "persisted-5374-revision-2";
const REPOSITORY = "mcp-mamono210/redmine";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const CURRENT_FINGERPRINT = FINGERPRINT;
const APPROVED_AT = "2026-09-07T13:00:00Z";

const REQUEST: AgentBriefApprovalRequest = {
  issueId: ISSUE_ID,
  briefRevision: BRIEF_REVISION,
  persistedRevision: PERSISTED_REVISION,
};

function issueFixture(): RedmineIssue {
  return {
    id: ISSUE_ID,
    project: { id: 414, name: "Redmine" },
    tracker: { id: 2, name: "Feature" },
    status: { id: 1, name: "New" },
    priority: { id: 2, name: "Normal" },
    author: { id: 10, name: "Chat GPT" },
    subject: "Phase 41 duplicate approval fixture",
    description: "Reconcile one exact completed approval.",
    customFields: [],
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

function lifecycleSnapshot(
  lifecycle: AgentBriefLifecycleSnapshot["lifecycle"],
  approvalMetadata: AgentBriefLifecycleSnapshot["approvalMetadata"] = {},
  handoffEligible = lifecycle === "Ready for Agent",
): AgentBriefLifecycleSnapshot {
  return {
    issueId: ISSUE_ID,
    projectId: 414,
    projectName: "Redmine",
    lifecycle,
    approvalMetadata,
    handoffEligible,
  };
}

class FakePhase40Handler implements AgentBriefApprovalPhase40Delegate {
  readonly requests: AgentBriefApprovalRequest[] = [];

  constructor(
    private readonly result: AgentBriefApprovalHandlerResult = {
      outcome: "validation_failed",
      issueId: ISSUE_ID,
      briefRevision: BRIEF_REVISION,
      persistedRevision: PERSISTED_REVISION,
      reason: "lifecycle_not_brief_ready",
      handoffEligible: false,
    },
  ) {}

  approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalHandlerResult> {
    this.requests.push({ ...request });
    return Promise.resolve(structuredClone(this.result));
  }
}

class FakeRedmineReader implements AgentBriefApprovalRedmineReader {
  getIssueCalls = 0;
  getCurrentUserCalls = 0;

  getIssue(): Promise<RedmineIssue> {
    this.getIssueCalls += 1;
    return Promise.resolve(issueFixture());
  }

  getCurrentUser(): Promise<RedmineUser> {
    this.getCurrentUserCalls += 1;
    return Promise.resolve({
      id: 3,
      login: "mamono210",
      firstname: "Mamono",
      lastname: "210",
    });
  }
}

class FakeLifecycleBoundary implements AgentBriefApprovalLifecycleBoundary {
  readonly transitionCalls: Array<{
    issueId: number;
    request: AgentBriefLifecycleTransitionRequest;
  }> = [];

  constructor(public snapshot: AgentBriefLifecycleSnapshot) {}

  read(): Promise<AgentBriefLifecycleSnapshot> {
    return Promise.resolve(structuredClone(this.snapshot));
  }

  transition(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    this.transitionCalls.push({ issueId, request });
    return Promise.resolve(structuredClone(this.snapshot));
  }
}

function createHandler(options: {
  lifecycle: AgentBriefLifecycleSnapshot;
  phase40Result?: AgentBriefApprovalHandlerResult;
  persisted?: PersistedAgentBrief;
  staleness?: "CURRENT" | "STALE";
}) {
  const phase40 = new FakePhase40Handler(options.phase40Result);
  const redmine = new FakeRedmineReader();
  const lifecycle = new FakeLifecycleBoundary(options.lifecycle);
  const persisted = options.persisted ?? persistedBrief();
  const stalenessKind = options.staleness ?? "CURRENT";

  const handler = new AgentBriefApprovalIdempotencyHandler(
    phase40,
    redmine,
    lifecycle,
    () => Promise.resolve(structuredClone(persisted)),
    {
      repository: REPOSITORY,
      projectGenerationInput: () =>
        ({ source: { redmine_issue_id: ISSUE_ID } }) as never,
      detectStaleness: () => ({
        kind: stalenessKind,
        repository: REPOSITORY,
        redmineIssueId: ISSUE_ID,
        briefRevision: BRIEF_REVISION,
        persistedRevision: PERSISTED_REVISION,
        persistedFingerprint: FINGERPRINT,
        currentFingerprint:
          stalenessKind === "CURRENT"
            ? CURRENT_FINGERPRINT
            : `sha256:${"b".repeat(64)}`,
      }),
    },
  );

  return { handler, phase40, redmine, lifecycle };
}

const APPROVAL_METADATA = {
  approverIdentity: "redmine-user:3",
  approvedAt: APPROVED_AT,
  approvedBriefRevision: BRIEF_REVISION,
  approvedPersistedRevision: PERSISTED_REVISION,
  approvedRequirementsFingerprint: FINGERPRINT,
} as const;

describe("AgentBriefApprovalIdempotencyHandler", () => {
  it("returns the original approved fact for an exact completed duplicate without writing", async () => {
    const fixture = createHandler({
      lifecycle: lifecycleSnapshot(
        "Ready for Agent",
        APPROVAL_METADATA,
      ),
    });

    await expect(fixture.handler.approve(REQUEST)).resolves.toEqual({
      outcome: "approved",
      issueId: ISSUE_ID,
      briefRevision: BRIEF_REVISION,
      persistedRevision: PERSISTED_REVISION,
      requirementsFingerprint: FINGERPRINT,
      lifecycle: "Ready for Agent",
      approverIdentity: "redmine-user:3",
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });

    expect(fixture.phase40.requests).toHaveLength(0);
    expect(fixture.lifecycle.transitionCalls).toHaveLength(0);
    expect(fixture.redmine.getCurrentUserCalls).toBe(0);
  });

  it("returns approval_conflict for different or incomplete approval metadata", async () => {
    const mismatch = createHandler({
      lifecycle: lifecycleSnapshot("Ready for Agent", {
        ...APPROVAL_METADATA,
        approvedPersistedRevision: "different-revision",
      }),
    });

    await expect(mismatch.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "approval_conflict",
      handoffEligible: false,
    });
    expect(mismatch.lifecycle.transitionCalls).toHaveLength(0);

    const incomplete = createHandler({
      lifecycle: lifecycleSnapshot("Ready for Agent", {
        approvedBriefRevision: BRIEF_REVISION,
        approvedPersistedRevision: PERSISTED_REVISION,
      }),
    });

    await expect(incomplete.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "approval_conflict",
    });
    expect(incomplete.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("does not treat a requirements mismatch in Ready for Agent as duplicate success", async () => {
    const fixture = createHandler({
      lifecycle: lifecycleSnapshot(
        "Ready for Agent",
        APPROVAL_METADATA,
      ),
      staleness: "STALE",
    });

    await expect(fixture.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "approval_conflict",
      handoffEligible: false,
    });
    expect(fixture.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("replays an already-stale Brief Draft as stale without moving it to Ready for Agent", async () => {
    const fixture = createHandler({
      lifecycle: lifecycleSnapshot("Brief Draft"),
      staleness: "STALE",
    });

    await expect(fixture.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "stale",
      lifecycle: "Brief Draft",
      handoffEligible: false,
    });
    expect(fixture.phase40.requests).toHaveLength(0);
    expect(fixture.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("requires renewed human review before a previously stale Brief Draft can become approved", async () => {
    const fixture = createHandler({
      lifecycle: lifecycleSnapshot("Brief Draft"),
      staleness: "CURRENT",
    });

    await expect(fixture.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "lifecycle_not_brief_ready",
    });
    expect(fixture.phase40.requests).toHaveLength(0);
    expect(fixture.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("delegates new Brief Ready approval work to the Phase 40 Handler", async () => {
    const phase40Result: AgentBriefApprovalHandlerResult = {
      outcome: "approved",
      issueId: ISSUE_ID,
      briefRevision: BRIEF_REVISION,
      persistedRevision: PERSISTED_REVISION,
      requirementsFingerprint: FINGERPRINT,
      lifecycle: "Ready for Agent",
      approverIdentity: "redmine-user:3",
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    };
    const fixture = createHandler({
      lifecycle: lifecycleSnapshot("Brief Ready"),
      phase40Result,
    });

    await expect(fixture.handler.approve(REQUEST)).resolves.toEqual(
      phase40Result,
    );
    expect(fixture.phase40.requests).toEqual([REQUEST]);
    expect(fixture.lifecycle.transitionCalls).toHaveLength(0);
  });
});
