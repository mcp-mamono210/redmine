import { describe, expect, it } from "vitest";

import {
  AgentBriefApprovalRecoveryLifecycleBoundary,
} from "../../src/agent-brief/approval-recovery.js";
import type {
  AgentBriefApprovalLifecycleBoundary,
  AgentBriefApprovalPersistedBriefReader,
  AgentBriefApprovalRedmineReader,
} from "../../src/agent-brief/approval-handler.js";
import {
  projectAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleError,
  AgentBriefLifecycleMetadataBoundary,
  type AgentBriefApprovalMetadata,
  type AgentBriefLifecycleReader,
  type AgentBriefLifecycleSnapshot,
  type AgentBriefLifecycleTransitionRequest,
} from "../../src/agent-brief/lifecycle-metadata.js";
import type { PersistedAgentBrief } from "../../src/agent-brief/persistence.js";
import {
  callApproveAgentBriefTool,
  type AgentBriefApprovalToolHandler,
} from "../../src/mcp/tools/agent-brief-approval.js";
import { WriteGuard } from "../../src/mcp/write-guard.js";
import type {
  AgentBriefLifecycleCustomFieldIds,
  AgentBriefLifecycleCustomFieldValues,
  AgentBriefLifecycleRedmineWriter,
} from "../../src/redmine/issue-custom-field-writer.js";
import { RedmineNetworkError } from "../../src/redmine/errors.js";
import type {
  RedmineCustomField,
  RedmineIssue,
  RedmineIssueInclude,
  RedmineProject,
  RedmineUser,
} from "../../src/redmine/types.js";

const ISSUE_ID = 5381;
const REPOSITORY = "mcp-mamono210/redmine";
const BRIEF_REVISION = 1;
const PERSISTED_REVISION = "persisted-security-regression";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const API_KEY = "phase42-secret-redmine-api-key";

const APPROVAL_METADATA: AgentBriefApprovalMetadata = {
  approverIdentity: "redmine-user:3",
  approvedAt: "2026-09-08T10:00:00Z",
  approvedBriefRevision: BRIEF_REVISION,
  approvedPersistedRevision: PERSISTED_REVISION,
  approvedRequirementsFingerprint: FINGERPRINT,
};

function field(id: number, name: string, value = ""): RedmineCustomField {
  return { id, name, value };
}

function lifecycleFields(lifecycle = "Brief Ready"): RedmineCustomField[] {
  return [
    field(101, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle, lifecycle),
    field(102, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy),
    field(103, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt),
    field(104, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision),
    field(105, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision),
    field(
      106,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedRequirementsFingerprint,
    ),
  ];
}

function issueFixture(): RedmineIssue {
  return {
    id: ISSUE_ID,
    project: { id: 414, name: "Redmine" },
    tracker: { id: 2, name: "Feature" },
    status: { id: 1, name: "New" },
    priority: { id: 2, name: "Normal" },
    author: { id: 10, name: "Chat GPT" },
    subject: `Security regression ${API_KEY}`,
    description: `Requirement contains ${API_KEY}`,
    customFields: [
      ...lifecycleFields(),
      { id: 201, name: "Requirement", value: `value=${API_KEY}` },
      { id: 202, name: "API Key", value: API_KEY },
    ],
    updatedOn: "2026-09-08T10:00:00Z",
    journals: [
      {
        id: 1,
        user: { id: 3, name: "mamono 210" },
        notes: `journal=${API_KEY}`,
        createdOn: "2026-09-08T10:00:00Z",
        details: [],
      },
    ],
    relations: [],
    children: [],
  };
}

class LifecycleReader implements AgentBriefLifecycleReader {
  constructor(
    private readonly issue: RedmineIssue,
    private readonly projectIdentifier: string,
  ) {}

  getIssue(): Promise<RedmineIssue> {
    return Promise.resolve(structuredClone(this.issue));
  }

  getProject(): Promise<RedmineProject> {
    return Promise.resolve({
      id: this.issue.project.id,
      name: this.issue.project.name,
      identifier: this.projectIdentifier,
    });
  }
}

class RecordingWriter implements AgentBriefLifecycleRedmineWriter {
  readonly calls: Array<{
    issueId: number;
    fieldIds: AgentBriefLifecycleCustomFieldIds;
    values: AgentBriefLifecycleCustomFieldValues;
  }> = [];

  updateAgentBriefLifecycleFields(
    issueId: number,
    fieldIds: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): Promise<void> {
    this.calls.push({
      issueId,
      fieldIds: { ...fieldIds },
      values: { ...values },
    });
    return Promise.resolve();
  }
}

function briefReadySnapshot(): AgentBriefLifecycleSnapshot {
  return {
    issueId: ISSUE_ID,
    projectId: 414,
    projectName: "Redmine",
    lifecycle: "Brief Ready",
    approvalMetadata: {},
    handoffEligible: false,
  };
}

class RecoveryInnerBoundary implements AgentBriefApprovalLifecycleBoundary {
  transitionCalls = 0;

  read(): Promise<AgentBriefLifecycleSnapshot> {
    return Promise.resolve(briefReadySnapshot());
  }

  transition(
    _issueId: number,
    _request: AgentBriefLifecycleTransitionRequest,
  ): Promise<AgentBriefLifecycleSnapshot> {
    this.transitionCalls += 1;

    if (this.transitionCalls === 1) {
      return Promise.reject(
        new RedmineNetworkError(
          `ambiguous transport failure containing ${API_KEY}`,
          "PUT",
          `/issues/${ISSUE_ID}.json`,
        ),
      );
    }

    return Promise.reject(
      new AgentBriefLifecycleError(
        "project_not_allowed",
        `project denied; credential=${API_KEY}`,
      ),
    );
  }
}

class RecoveryReader implements AgentBriefApprovalRedmineReader {
  getIssue(
    _issueId: number,
    _options?: { include?: readonly RedmineIssueInclude[] },
  ): Promise<RedmineIssue> {
    const issue = issueFixture();
    issue.subject = "Security regression";
    issue.description = "current requirements";
    issue.customFields = lifecycleFields();
    issue.journals = [];
    return Promise.resolve(issue);
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

describe("Phase 42-1 Agent Brief security regression", () => {
  it("removes configured secrets and credential-named fields from generation input", () => {
    const projected = projectAgentBriefGenerationInput(issueFixture(), {
      requirementCustomFieldIds: [201, 202],
      configuredSecrets: [API_KEY],
    });
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('"name":"API Key"');
    expect(projected.projection.redacted_paths.length).toBeGreaterThan(0);
  });

  it("fails closed before a lifecycle writer call when writes are disabled", async () => {
    const reader = new LifecycleReader(issueFixture(), "mcp-agent-brief");
    const writer = new RecordingWriter();
    const boundary = new AgentBriefLifecycleMetadataBoundary(
      reader,
      writer,
      new WriteGuard({
        writeEnabled: false,
        allowedProjects: ["mcp-agent-brief"],
      }),
    );

    await expect(
      boundary.transition(ISSUE_ID, {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: APPROVAL_METADATA,
      }),
    ).rejects.toMatchObject({ code: "writes_disabled" });
    expect(writer.calls).toHaveLength(0);
  });

  it("fails closed before a lifecycle writer call for a disallowed project", async () => {
    const reader = new LifecycleReader(issueFixture(), "mcp-agent-brief");
    const writer = new RecordingWriter();
    const boundary = new AgentBriefLifecycleMetadataBoundary(
      reader,
      writer,
      new WriteGuard({
        writeEnabled: true,
        allowedProjects: ["different-project"],
      }),
    );

    await expect(
      boundary.transition(ISSUE_ID, {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: APPROVAL_METADATA,
      }),
    ).rejects.toMatchObject({ code: "project_not_allowed" });
    expect(writer.calls).toHaveLength(0);
  });

  it("reuses the guarded lifecycle boundary on recovery retry and does not mask authorization denial", async () => {
    const inner = new RecoveryInnerBoundary();
    const readPersistedBrief: AgentBriefApprovalPersistedBriefReader = () =>
      Promise.resolve(persistedBrief());
    const recovery = new AgentBriefApprovalRecoveryLifecycleBoundary(
      inner,
      new RecoveryReader(),
      readPersistedBrief,
      {
        repository: REPOSITORY,
        projectGenerationInput: (issue) => ({
          format_version: 1,
          source: {
            redmine_issue_id: issue.id,
            source_updated_on: "2026-09-08T10:00:00Z",
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
        detectStaleness: () => ({
          kind: "CURRENT",
          repository: REPOSITORY,
          redmineIssueId: ISSUE_ID,
          briefRevision: BRIEF_REVISION,
          persistedRevision: PERSISTED_REVISION,
          persistedFingerprint: FINGERPRINT,
          currentFingerprint: FINGERPRINT,
        }),
      },
    );

    await expect(
      recovery.transition(ISSUE_ID, {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: APPROVAL_METADATA,
      }),
    ).rejects.toMatchObject({ code: "project_not_allowed" });
    expect(inner.transitionCalls).toBe(2);
  });

  it("sanitizes backend messages, nested credentials, and stack details at the MCP boundary", async () => {
    const handler: AgentBriefApprovalToolHandler = {
      approve: () =>
        Promise.reject(
          new Error(
            `backend body credential=${API_KEY}\nstack: sensitive-internal-stack`,
          ),
        ),
    };

    const result = await callApproveAgentBriefTool(handler, {
      issue_id: ISSUE_ID,
      brief_revision: BRIEF_REVISION,
      persisted_revision: PERSISTED_REVISION,
    });
    const text = result.content[0]!.text;

    expect(result.isError).toBe(true);
    expect(text).toContain("internal_error");
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain("backend body");
    expect(text).not.toContain("sensitive-internal-stack");
  });
});
