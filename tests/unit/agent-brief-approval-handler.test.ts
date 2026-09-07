import { describe, expect, it } from "vitest";

import {
  AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
  AgentBriefApprovalHandler,
  AgentBriefApprovalHandlerError,
  type AgentBriefApprovalLifecycleBoundary,
  type AgentBriefApprovalPersistedBriefReader,
  type AgentBriefApprovalRedmineReader,
  type AgentBriefApprovalStalenessDetector,
} from "../../src/agent-brief/approval-handler.js";
import {
  projectAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  AgentBriefLifecycleError,
  type AgentBriefLifecycleSnapshot,
  type AgentBriefLifecycleTransitionRequest,
} from "../../src/agent-brief/lifecycle-metadata.js";
import type { PersistedAgentBrief } from "../../src/agent-brief/persistence.js";
import {
  calculateAgentBriefRequirementsFingerprint,
} from "../../src/agent-brief/requirements-fingerprint.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineUser,
} from "../../src/redmine/types.js";

const ISSUE_ID = 5371;
const BRIEF_REVISION = 1;
const PERSISTED_REVISION = "0123456789abcdef";
const APPROVED_AT = "2026-09-07T08:30:00Z";

function issueFixture(): RedmineIssue {
  return {
    id: ISSUE_ID,
    project: {
      id: 414,
      name: "Redmine",
    },
    tracker: {
      id: 2,
      name: "Feature",
    },
    status: {
      id: 1,
      name: "New",
    },
    priority: {
      id: 2,
      name: "Normal",
    },
    author: {
      id: 10,
      name: "Chat GPT",
    },
    assignedTo: {
      id: 3,
      name: "mamono 210",
    },
    fixedVersion: {
      id: 29,
      name: "0.3.0",
    },
    subject: "Human Approval Handler Orchestration",
    description:
      "Validate one exact persisted Brief before Ready for Agent.",
    customFields: [
      {
        id: 21,
        name: "Requirement",
        value: "Reuse Phase 38 and Phase 39 boundaries.",
      },
    ],
    updatedOn: "2026-09-07T08:00:00Z",
  };
}

function briefMarkdown(fingerprint: string): string {
  return `---
format_version: 1
redmine_issue_id: ${ISSUE_ID}
repository: mcp-mamono210/redmine
brief_revision: ${BRIEF_REVISION}
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Approve one exact human-reviewed Agent Brief only after Handler Validation.

### Context

Phase 40 consumes Phase 37 persistence, Phase 38 lifecycle metadata, and Phase 39 staleness detection.

### In Scope

- Validate one exact reviewed persisted Brief reference.
- Orchestrate CURRENT and STALE results.

### Out of Scope

- Public MCP Tool registration.
- Retry and recovery.
- Agent execution.

### Requirements

- CURRENT may proceed to Ready for Agent.
- STALE must return to Brief Draft.

### Architecture / Contract Constraints

- Reuse existing lifecycle and staleness boundaries.
- Do not add a direct custom-field writer.

### Acceptance Criteria

- [ ] AC-1: Only the exact CURRENT reviewed Brief can become Ready for Agent.

### Verification

- AC-1: Exercise the Phase 40 Approval Handler orchestration.

### Deliverables

- The internal Approval Handler result.

### Unresolved / Blocking

None.
`;
}

function persistedBrief(issue = issueFixture()): PersistedAgentBrief {
  const input = projectAgentBriefGenerationInput(issue, {
    requirementCustomFieldIds: [21],
  });
  const fingerprint =
    calculateAgentBriefRequirementsFingerprint(input);

  return {
    repository: "mcp-mamono210/redmine",
    artifactPath:
      `docs/agent-briefs/${ISSUE_ID}/revisions/${BRIEF_REVISION}.md`,
    redmineIssueId: ISSUE_ID,
    briefRevision: BRIEF_REVISION,
    persistedRevision: PERSISTED_REVISION,
    markdown: briefMarkdown(fingerprint),
  };
}

function lifecycleSnapshot(
  lifecycle: AgentBriefLifecycleSnapshot["lifecycle"] = "Brief Ready",
  approvalMetadata: AgentBriefLifecycleSnapshot["approvalMetadata"] = {},
): AgentBriefLifecycleSnapshot {
  return {
    issueId: ISSUE_ID,
    projectId: 414,
    projectName: "Redmine",
    lifecycle,
    approvalMetadata,
    handoffEligible: lifecycle === "Ready for Agent",
  };
}

interface RedmineGetIssueCall {
  issueId: number;
  include?: readonly RedmineIssueInclude[];
}

class FakeRedmineReader implements AgentBriefApprovalRedmineReader {
  readonly issueCalls: RedmineGetIssueCall[] = [];
  currentUserCalls = 0;
  issueError: Error | undefined;
  currentUserError: Error | undefined;

  constructor(
    public currentIssue: RedmineIssue = issueFixture(),
    public currentUser: RedmineUser = {
      id: 3,
      login: "mamono210",
      firstname: "Mamono",
      lastname: "210",
    },
  ) {}

  getIssue(
    issueId: number,
    options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue> {
    this.issueCalls.push({
      issueId,
      ...(options?.include === undefined
        ? {}
        : { include: [...options.include] }),
    });

    if (this.issueError !== undefined) {
      return Promise.reject(this.issueError);
    }

    return Promise.resolve(structuredClone(this.currentIssue));
  }

  getCurrentUser(): Promise<RedmineUser> {
    this.currentUserCalls += 1;

    if (this.currentUserError !== undefined) {
      return Promise.reject(this.currentUserError);
    }

    return Promise.resolve(structuredClone(this.currentUser));
  }
}

interface LifecycleTransitionCall {
  issueId: number;
  request: AgentBriefLifecycleTransitionRequest;
}

class FakeLifecycleBoundary implements AgentBriefApprovalLifecycleBoundary {
  readonly readCalls: number[] = [];
  readonly transitionCalls: LifecycleTransitionCall[] = [];
  transitionError: Error | undefined;
  forcedTransitionSnapshot: AgentBriefLifecycleSnapshot | undefined;

  constructor(
    public currentSnapshot: AgentBriefLifecycleSnapshot =
      lifecycleSnapshot(),
  ) {}

  read(issueId: number): Promise<AgentBriefLifecycleSnapshot> {
    this.readCalls.push(issueId);
    return Promise.resolve(structuredClone(this.currentSnapshot));
  }

  transition(
    issueId: number,
    request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    this.transitionCalls.push({
      issueId,
      request: structuredClone(request),
    });

    if (this.transitionError !== undefined) {
      return Promise.reject(this.transitionError);
    }

    if (this.forcedTransitionSnapshot !== undefined) {
      return Promise.resolve(
        structuredClone(this.forcedTransitionSnapshot),
      );
    }

    this.currentSnapshot = {
      issueId: ISSUE_ID,
      projectId: 414,
      projectName: "Redmine",
      lifecycle: request.targetLifecycle,
      approvalMetadata:
        request.approvalMetadata ??
        this.currentSnapshot.approvalMetadata,
      handoffEligible:
        request.targetLifecycle === "Ready for Agent",
    };

    return Promise.resolve(structuredClone(this.currentSnapshot));
  }
}

interface PersistedReaderControl {
  calls: Array<{
    issueId: number;
    briefRevision: number;
  }>;
  reader: AgentBriefApprovalPersistedBriefReader;
}

function persistedReader(
  persisted: PersistedAgentBrief = persistedBrief(),
): PersistedReaderControl {
  const calls: PersistedReaderControl["calls"] = [];

  return {
    calls,
    reader: (issueId, briefRevision) => {
      calls.push({ issueId, briefRevision });
      return Promise.resolve(structuredClone(persisted));
    },
  };
}

function handlerFixture(options?: {
  redmine?: FakeRedmineReader;
  lifecycle?: FakeLifecycleBoundary;
  persisted?: PersistedReaderControl;
  detectStaleness?: AgentBriefApprovalStalenessDetector;
}): {
  handler: AgentBriefApprovalHandler;
  redmine: FakeRedmineReader;
  lifecycle: FakeLifecycleBoundary;
  persisted: PersistedReaderControl;
} {
  const redmine = options?.redmine ?? new FakeRedmineReader();
  const lifecycle =
    options?.lifecycle ?? new FakeLifecycleBoundary();
  const persisted = options?.persisted ?? persistedReader();

  return {
    handler: new AgentBriefApprovalHandler(
      redmine,
      lifecycle,
      persisted.reader,
      {
        generationInputPolicy: {
          requirementCustomFieldIds: [21],
        },
        clock: () => APPROVED_AT,
        ...(options?.detectStaleness === undefined
          ? {}
          : { detectStaleness: options.detectStaleness }),
      },
    ),
    redmine,
    lifecycle,
    persisted,
  };
}

const REQUEST = {
  issueId: ISSUE_ID,
  briefRevision: BRIEF_REVISION,
  persistedRevision: PERSISTED_REVISION,
} as const;

async function expectHandlerError(
  promise: Promise<unknown>,
  code: AgentBriefApprovalHandlerError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "AgentBriefApprovalHandlerError",
    code,
  });
}

describe("AgentBriefApprovalHandler", () => {
  it("approves only an exact CURRENT reviewed reference and builds approval metadata from trusted boundaries", async () => {
    const {
      handler,
      redmine,
      lifecycle,
      persisted,
    } = handlerFixture();

    const result = await handler.approve(REQUEST);
    const expectedFingerprint =
      calculateAgentBriefRequirementsFingerprint(
        projectAgentBriefGenerationInput(issueFixture(), {
          requirementCustomFieldIds: [21],
        }),
      );

    expect(result).toEqual({
      outcome: "approved",
      issueId: ISSUE_ID,
      briefRevision: BRIEF_REVISION,
      persistedRevision: PERSISTED_REVISION,
      requirementsFingerprint: expectedFingerprint,
      lifecycle: "Ready for Agent",
      approverIdentity: "redmine-user:3",
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });

    expect(redmine.issueCalls).toEqual([
      {
        issueId: ISSUE_ID,
        include: AGENT_BRIEF_APPROVAL_REQUIREMENTS_INCLUDES,
      },
    ]);
    expect(lifecycle.readCalls).toEqual([ISSUE_ID]);
    expect(persisted.calls).toEqual([
      {
        issueId: ISSUE_ID,
        briefRevision: BRIEF_REVISION,
      },
    ]);
    expect(redmine.currentUserCalls).toBe(1);
    expect(lifecycle.transitionCalls).toEqual([
      {
        issueId: ISSUE_ID,
        request: {
          targetLifecycle: "Ready for Agent",
          approvalMetadata: {
            approverIdentity: "redmine-user:3",
            approvedAt: APPROVED_AT,
            approvedBriefRevision: BRIEF_REVISION,
            approvedPersistedRevision: PERSISTED_REVISION,
            approvedRequirementsFingerprint: expectedFingerprint,
          },
        },
      },
    ]);
  });

  it("rejects a reviewed revision or persisted-revision mismatch without lifecycle mutation", async () => {
    const wrongRevision = persistedBrief();
    wrongRevision.briefRevision = 2;
    wrongRevision.artifactPath =
      `docs/agent-briefs/${ISSUE_ID}/revisions/2.md`;
    const first = handlerFixture({
      persisted: persistedReader(wrongRevision),
    });

    await expect(first.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "reviewed_reference_invalid",
      handoffEligible: false,
    });
    expect(first.lifecycle.transitionCalls).toHaveLength(0);
    expect(first.redmine.currentUserCalls).toBe(0);

    const wrongPersistedRevision = persistedBrief();
    wrongPersistedRevision.persistedRevision = "different-object-id";
    const second = handlerFixture({
      persisted: persistedReader(wrongPersistedRevision),
    });

    await expect(second.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "reviewed_reference_invalid",
    });
    expect(second.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("maps STALE to the existing Brief Draft transition without resolving an approver", async () => {
    const redmine = new FakeRedmineReader();
    redmine.currentIssue.description =
      "Requirements changed after the human-reviewed Brief was persisted.";
    const fixture = handlerFixture({ redmine });

    const result = await fixture.handler.approve(REQUEST);

    expect(result).toMatchObject({
      outcome: "stale",
      issueId: ISSUE_ID,
      briefRevision: BRIEF_REVISION,
      persistedRevision: PERSISTED_REVISION,
      lifecycle: "Brief Draft",
      handoffEligible: false,
    });
    expect(fixture.redmine.currentUserCalls).toBe(0);
    expect(fixture.lifecycle.transitionCalls).toEqual([
      {
        issueId: ISSUE_ID,
        request: {
          targetLifecycle: "Brief Draft",
        },
      },
    ]);
  });

  it("keeps INVALID_REFERENCE and FINGERPRINT_UNAVAILABLE distinct from STALE and performs no write", async () => {
    const invalidReference = handlerFixture({
      detectStaleness: () => ({
        kind: "INVALID_REFERENCE",
        reason: "internal reference diagnostic",
      }),
    });

    await expect(
      invalidReference.handler.approve(REQUEST),
    ).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "reviewed_reference_invalid",
    });
    expect(
      invalidReference.lifecycle.transitionCalls,
    ).toHaveLength(0);

    const unavailable = handlerFixture({
      detectStaleness: () => ({
        kind: "FINGERPRINT_UNAVAILABLE",
        reason: "internal fingerprint diagnostic",
      }),
    });

    await expect(
      unavailable.handler.approve(REQUEST),
    ).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "fingerprint_unavailable",
    });
    expect(unavailable.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("requires Brief Ready and does not reinterpret a completed approval as Phase 40 idempotent success", async () => {
    const draft = handlerFixture({
      lifecycle: new FakeLifecycleBoundary(
        lifecycleSnapshot("Brief Draft"),
      ),
    });

    await expect(draft.handler.approve(REQUEST)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "lifecycle_not_brief_ready",
    });
    expect(draft.persisted.calls).toHaveLength(0);

    const alreadyReady = handlerFixture({
      lifecycle: new FakeLifecycleBoundary(
        lifecycleSnapshot("Ready for Agent", {
          approverIdentity: "redmine-user:3",
          approvedAt: APPROVED_AT,
          approvedBriefRevision: BRIEF_REVISION,
          approvedPersistedRevision: PERSISTED_REVISION,
          approvedRequirementsFingerprint: `sha256:${"a".repeat(64)}`,
        }),
      ),
    });

    await expect(
      alreadyReady.handler.approve(REQUEST),
    ).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "lifecycle_not_brief_ready",
    });
    expect(alreadyReady.lifecycle.transitionCalls).toHaveLength(0);
  });

  it("preserves the Phase 38 project guard and never exposes a dependency credential in the Handler error", async () => {
    const lifecycle = new FakeLifecycleBoundary();
    lifecycle.transitionError = new AgentBriefLifecycleError(
      "project_not_allowed",
      "project blocked; X-Redmine-API-Key: super-secret",
    );
    const fixture = handlerFixture({ lifecycle });

    let thrown: unknown;
    try {
      await fixture.handler.approve(REQUEST);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "AgentBriefApprovalHandlerError",
      code: "project_not_allowed",
      message: "Agent Brief approval is not allowed for this project.",
    });
    expect(String(thrown)).not.toContain("super-secret");
  });

  it("sanitizes unexpected Redmine read failures instead of copying backend diagnostics", async () => {
    const redmine = new FakeRedmineReader();
    redmine.issueError = new Error(
      "Authorization: Bearer secret-token; raw backend body",
    );
    const fixture = handlerFixture({ redmine });

    let thrown: unknown;
    try {
      await fixture.handler.approve(REQUEST);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "AgentBriefApprovalHandlerError",
      code: "issue_read_failed",
      message:
        "Current Redmine Issue could not be loaded for Agent Brief approval.",
    });
    expect(String(thrown)).not.toContain("secret-token");
    expect(String(thrown)).not.toContain("raw backend body");
  });

  it("fails closed when lifecycle read-back does not prove the approved state", async () => {
    const lifecycle = new FakeLifecycleBoundary();
    lifecycle.forcedTransitionSnapshot = {
      ...lifecycleSnapshot("Ready for Agent"),
      handoffEligible: false,
    };
    const fixture = handlerFixture({ lifecycle });

    await expectHandlerError(
      fixture.handler.approve(REQUEST),
      "approval_readback_mismatch",
    );
  });
});
