import { describe, expect, it } from "vitest";

import {
  agentBriefApprovalOutputSchema,
  currentUserOutputSchema,
  getIssueOutputSchema,
  getProjectOutputSchema,
  listIssuesOutputSchema,
  listProjectsOutputSchema,
  searchOutputSchema,
} from "../../src/mcp/output-schemas.js";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;

describe("public MCP output schemas", () => {
  it("accepts the current user public contract", () => {
    expect(
      currentUserOutputSchema.safeParse({
        id: 7,
        login: "mcp-test",
        firstname: "MCP",
        lastname: "Test",
        mail: "mcp-test@example.test",
      }).success,
    ).toBe(true);
  });

  it("accepts issue detail with optional associations", () => {
    expect(
      getIssueOutputSchema.safeParse({
        id: 101,
        project: { id: 1, name: "MCP Test Project" },
        tracker: { id: 1, name: "Bug" },
        status: { id: 1, name: "New", is_closed: false },
        priority: { id: 2, name: "Normal" },
        author: { id: 2, name: "MCP Test User" },
        assigned_to: { id: 2, name: "MCP Test User" },
        subject: "Authentication fails for invalid API token",
        description: "Representative issue",
        custom_fields: [
          {
            id: 5,
            name: "release_tag",
            value: "v0.2.0",
          },
        ],
        allowed_statuses: [
          { id: 1, name: "New" },
          { id: 2, name: "In Progress" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts summarized issue pagination", () => {
    expect(
      listIssuesOutputSchema.safeParse({
        items: [
          {
            id: 101,
            subject: "Authentication fails for invalid API token",
            project: { id: 1, name: "MCP Test Project" },
            tracker: { id: 1, name: "Bug" },
            status: { id: 1, name: "New" },
            priority: { id: 2, name: "Normal" },
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 10,
      }).success,
    ).toBe(true);
  });

  it("accepts get_project with populated metadata", () => {
    expect(
      getProjectOutputSchema.safeParse({
        project: {
          id: 1,
          identifier: "mcp-test",
          name: "MCP Test Project",
          is_public: false,
        },
        trackers: [{ id: 1, name: "Bug" }],
        categories: [],
        custom_fields: [
          {
            id: 5,
            name: "release_tag",
            field_format: "string",
            is_required: false,
          },
        ],
        versions: [
          {
            id: 3,
            name: "v0.2.0",
            status: "open",
            sharing: "none",
          },
        ],
        members: [
          {
            id: 7,
            user: { id: 2, name: "MCP Test User" },
            roles: [{ id: 4, name: "MCP Read Only" }],
          },
        ],
        priorities: [
          { id: 1, name: "Low" },
          { id: 2, name: "Normal" },
        ],
        warnings: [],
      }).success,
    ).toBe(true);
  });

  it("accepts get_project partial failure nulls and warnings", () => {
    expect(
      getProjectOutputSchema.safeParse({
        project: {
          id: 1,
          identifier: "mcp-test",
          name: "MCP Test Project",
        },
        trackers: [],
        categories: [],
        custom_fields: [],
        versions: null,
        members: [],
        priorities: null,
        warnings: [
          "versions: unavailable",
          "priorities: unavailable",
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts summarized project pagination", () => {
    expect(
      listProjectsOutputSchema.safeParse({
        items: [
          {
            id: 1,
            identifier: "mcp-test",
            name: "MCP Test Project",
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 25,
      }).success,
    ).toBe(true);
  });

  it("accepts summarized search pagination", () => {
    expect(
      searchOutputSchema.safeParse({
        items: [
          {
            id: 101,
            title: "Authentication fails for invalid API token",
            type: "issue",
            url: "http://redmine.test/issues/101",
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 10,
      }).success,
    ).toBe(true);
  });

  it("accepts all three Agent Brief approval domain outcomes", () => {
    expect(
      agentBriefApprovalOutputSchema.safeParse({
        outcome: "approved",
        issue_id: 5372,
        brief_revision: 1,
        persisted_revision: "abcdef",
        requirements_fingerprint: FINGERPRINT,
        lifecycle: "Ready for Agent",
        approver_identity: "redmine-user:7",
        approved_at: "2026-09-07T08:00:00Z",
        handoff_eligible: true,
      }).success,
    ).toBe(true);

    expect(
      agentBriefApprovalOutputSchema.safeParse({
        outcome: "stale",
        issue_id: 5372,
        brief_revision: 1,
        persisted_revision: "abcdef",
        persisted_requirements_fingerprint: FINGERPRINT,
        current_requirements_fingerprint:
          `sha256:${"b".repeat(64)}`,
        lifecycle: "Brief Draft",
        handoff_eligible: false,
      }).success,
    ).toBe(true);

    expect(
      agentBriefApprovalOutputSchema.safeParse({
        outcome: "validation_failed",
        issue_id: 5372,
        brief_revision: 1,
        persisted_revision: "abcdef",
        reason: "reviewed_reference_invalid",
        handoff_eligible: false,
      }).success,
    ).toBe(true);
  });

  it("rejects cross-variant Agent Brief approval fields", () => {
    expect(
      agentBriefApprovalOutputSchema.safeParse({
        outcome: "approved",
        issue_id: 5372,
        brief_revision: 1,
        persisted_revision: "abcdef",
        lifecycle: "Brief Draft",
        handoff_eligible: false,
      }).success,
    ).toBe(false);
  });
});
