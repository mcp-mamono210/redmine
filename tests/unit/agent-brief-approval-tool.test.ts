import { describe, expect, it } from "vitest";

import type { AgentBriefApprovalRequest } from "../../src/agent-brief/approval-handler.js";
import type { AgentBriefApprovalIdempotentResult } from "../../src/agent-brief/approval-idempotency.js";
import {
  approveAgentBriefInputSchema,
  callApproveAgentBriefTool,
  type AgentBriefApprovalToolHandler,
} from "../../src/mcp/tools/agent-brief-approval.js";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;

class FakeApprovalHandler implements AgentBriefApprovalToolHandler {
  readonly requests: AgentBriefApprovalRequest[] = [];

  constructor(
    private readonly result?: AgentBriefApprovalIdempotentResult,
    private readonly error?: Error,
  ) {}

  approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalIdempotentResult> {
    this.requests.push({ ...request });

    if (this.error !== undefined) {
      return Promise.reject(this.error);
    }

    if (this.result === undefined) {
      return Promise.reject(
        new Error("Fake approval result is not configured"),
      );
    }

    return Promise.resolve(this.result);
  }
}

function parseText(result: {
  content: Array<{ type: "text"; text: string }>;
}): unknown {
  return JSON.parse(result.content[0]!.text) as unknown;
}

describe("redmine_approve_agent_brief Tool adapter", () => {
  it("delegates the exact reviewed reference and returns approved in public snake_case", async () => {
    const handler = new FakeApprovalHandler({
      outcome: "approved",
      issueId: 5372,
      briefRevision: 3,
      persistedRevision: "abcdef0123456789",
      requirementsFingerprint: FINGERPRINT,
      lifecycle: "Ready for Agent",
      approverIdentity: "redmine-user:7",
      approvedAt: "2026-09-07T08:00:00Z",
      handoffEligible: true,
    });

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: 5372,
      brief_revision: 3,
      persisted_revision: "abcdef0123456789",
    });

    expect(handler.requests).toEqual([
      {
        issueId: 5372,
        briefRevision: 3,
        persistedRevision: "abcdef0123456789",
      },
    ]);
    expect(result.isError).toBe(false);
    if (!("structuredContent" in result)) {
      throw new Error("Expected successful structuredContent");
    }
    expect(result.structuredContent).toEqual({
      outcome: "approved",
      issue_id: 5372,
      brief_revision: 3,
      persisted_revision: "abcdef0123456789",
      requirements_fingerprint: FINGERPRINT,
      lifecycle: "Ready for Agent",
      approver_identity: "redmine-user:7",
      approved_at: "2026-09-07T08:00:00Z",
      handoff_eligible: true,
    });
    expect(parseText(result)).toEqual(result.structuredContent);
  });

  it("preserves stale as a non-approved bounded outcome", async () => {
    const handler = new FakeApprovalHandler({
      outcome: "stale",
      issueId: 5372,
      briefRevision: 2,
      persistedRevision: "persisted-stale",
      persistedRequirementsFingerprint: FINGERPRINT,
      currentRequirementsFingerprint:
        `sha256:${"b".repeat(64)}`,
      lifecycle: "Brief Draft",
      handoffEligible: false,
    });

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: 5372,
      brief_revision: 2,
      persisted_revision: "persisted-stale",
    });

    expect(result.isError).toBe(false);
    if (!("structuredContent" in result)) {
      throw new Error("Expected successful structuredContent");
    }
    expect(result.structuredContent).toMatchObject({
      outcome: "stale",
      lifecycle: "Brief Draft",
      handoff_eligible: false,
    });
  });

  it("preserves validation_failed without converting it to approval success", async () => {
    const handler = new FakeApprovalHandler({
      outcome: "validation_failed",
      issueId: 5372,
      briefRevision: 2,
      persistedRevision: "wrong-reference",
      reason: "reviewed_reference_invalid",
      handoffEligible: false,
    });

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: 5372,
      brief_revision: 2,
      persisted_revision: "wrong-reference",
    });

    expect(result.isError).toBe(false);
    if (!("structuredContent" in result)) {
      throw new Error("Expected successful structuredContent");
    }
    expect(result.structuredContent).toEqual({
      outcome: "validation_failed",
      issue_id: 5372,
      brief_revision: 2,
      persisted_revision: "wrong-reference",
      reason: "reviewed_reference_invalid",
      handoff_eligible: false,
    });
  });

  it("publishes approval_conflict as the bounded Phase 41 validation result", async () => {
    const handler = new FakeApprovalHandler({
      outcome: "validation_failed",
      issueId: 5374,
      briefRevision: 2,
      persistedRevision: "persisted-conflict",
      reason: "approval_conflict",
      handoffEligible: false,
    });

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: 5374,
      brief_revision: 2,
      persisted_revision: "persisted-conflict",
    });

    expect(result.isError).toBe(false);
    if (!("structuredContent" in result)) {
      throw new Error("Expected successful structuredContent");
    }
    expect(result.structuredContent).toEqual({
      outcome: "validation_failed",
      issue_id: 5374,
      brief_revision: 2,
      persisted_revision: "persisted-conflict",
      reason: "approval_conflict",
      handoff_eligible: false,
    });
    expect(parseText(result)).toEqual(result.structuredContent);
  });

  it("fails malformed public input before Handler invocation", () => {
    expect(
      approveAgentBriefInputSchema.safeParse({
        issue_id: 0,
        brief_revision: 1,
        persisted_revision: "abc",
      }).success,
    ).toBe(false);

    expect(
      approveAgentBriefInputSchema.safeParse({
        issue_id: 1,
        brief_revision: Number.MAX_SAFE_INTEGER + 1,
        persisted_revision: "abc",
      }).success,
    ).toBe(false);

    expect(
      approveAgentBriefInputSchema.safeParse({
        issue_id: 1,
        brief_revision: 1,
        persisted_revision: "   ",
      }).success,
    ).toBe(false);
  });

  it("maps Handler failures through the bounded credential-safe application error path", async () => {
    const secret = "super-secret-redmine-api-key";
    const handler = new FakeApprovalHandler(
      undefined,
      new Error(`backend failed with credential ${secret}`),
    );

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: 5372,
      brief_revision: 1,
      persisted_revision: "abcdef",
    });

    const text = result.content[0]!.text;

    expect(result.isError).toBe(true);
    expect(text).toContain("internal_error");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("backend failed");
  });
});
