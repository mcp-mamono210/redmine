import { describe, expect, it } from "vitest";

import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleError,
  AgentBriefLifecycleMetadataBoundary,
  type AgentBriefApprovalMetadata,
  type AgentBriefLifecycleReader,
} from "../../src/agent-brief/lifecycle-metadata.js";
import { WriteGuard } from "../../src/mcp/write-guard.js";
import type {
  AgentBriefLifecycleCustomFieldIds,
  AgentBriefLifecycleCustomFieldValues,
  AgentBriefLifecycleRedmineWriter,
} from "../../src/redmine/issue-custom-field-writer.js";
import type {
  RedmineCustomField,
  RedmineIssue,
  RedmineProject,
} from "../../src/redmine/types.js";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;

const COMPLETE_APPROVAL: AgentBriefApprovalMetadata = {
  approverIdentity: "redmine-user:42",
  approvedAt: "2026-09-07T04:00:00Z",
  approvedBriefRevision: 3,
  approvedPersistedRevision: "opaque-persisted-revision",
  approvedRequirementsFingerprint: FINGERPRINT,
};

const EXPECTED_FIELD_IDS: AgentBriefLifecycleCustomFieldIds = {
  lifecycle: 101,
  approvedBy: 102,
  approvedAt: 103,
  approvedBriefRevision: 104,
  approvedPersistedRevision: 105,
  approvedRequirementsFingerprint: 106,
};

function field(id: number, name: string, value = ""): RedmineCustomField {
  return { id, name, value };
}

function lifecycleFields(
  lifecycle = "Brief Draft",
  metadata: Partial<AgentBriefApprovalMetadata> = {},
): RedmineCustomField[] {
  return [
    field(101, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle, lifecycle),
    field(
      102,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy,
      metadata.approverIdentity ?? "",
    ),
    field(
      103,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt,
      metadata.approvedAt ?? "",
    ),
    field(
      104,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
      metadata.approvedBriefRevision === undefined
        ? ""
        : String(metadata.approvedBriefRevision),
    ),
    field(
      105,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
      metadata.approvedPersistedRevision ?? "",
    ),
    field(
      106,
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedRequirementsFingerprint,
      metadata.approvedRequirementsFingerprint ?? "",
    ),
    field(999, "release_tag", "v0.3.0"),
  ];
}

function issue(
  lifecycle = "Brief Draft",
  metadata: Partial<AgentBriefApprovalMetadata> = {},
): RedmineIssue {
  return {
    id: 5366,
    project: { id: 1, name: "MCP Test Project" },
    tracker: { id: 1, name: "Feature" },
    status: { id: 1, name: "New" },
    priority: { id: 2, name: "Normal" },
    author: { id: 1, name: "MCP Test" },
    subject: "Phase 38 lifecycle test",
    customFields: lifecycleFields(lifecycle, metadata),
  };
}

class FakeReader implements AgentBriefLifecycleReader {
  constructor(
    private currentIssue: RedmineIssue,
    private readonly projectIdentifier = "mcp-test",
  ) {}

  getIssue(): Promise<RedmineIssue> {
    return Promise.resolve(structuredClone(this.currentIssue));
  }

  getProject(): Promise<RedmineProject> {
    return Promise.resolve({
      id: this.currentIssue.project.id,
      name: this.currentIssue.project.name,
      identifier: this.projectIdentifier,
    });
  }

  apply(
    fieldIds: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): void {
    const byId = new Map(
      this.currentIssue.customFields.map((customField) => [
        customField.id,
        customField,
      ]),
    );
    const writes: ReadonlyArray<readonly [number, string | undefined]> = [
      [fieldIds.lifecycle, values.lifecycle],
      [fieldIds.approvedBy, values.approvedBy],
      [fieldIds.approvedAt, values.approvedAt],
      [fieldIds.approvedBriefRevision, values.approvedBriefRevision],
      [fieldIds.approvedPersistedRevision, values.approvedPersistedRevision],
      [
        fieldIds.approvedRequirementsFingerprint,
        values.approvedRequirementsFingerprint,
      ],
    ];

    for (const [id, value] of writes) {
      if (value === undefined) {
        continue;
      }

      const target = byId.get(id);
      if (!target) {
        throw new Error(`Unknown fake field ID: ${id}`);
      }
      target.value = value;
    }
  }
}

interface FakeWriterCall {
  issueId: number;
  fieldIds: AgentBriefLifecycleCustomFieldIds;
  values: AgentBriefLifecycleCustomFieldValues;
}

class FakeWriter implements AgentBriefLifecycleRedmineWriter {
  readonly calls: FakeWriterCall[] = [];

  constructor(private readonly reader: FakeReader) {}

  updateAgentBriefLifecycleFields(
    issueId: number,
    fieldIds: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): Promise<void> {
    const copiedFieldIds = { ...fieldIds };
    const copiedValues = { ...values };
    this.calls.push({
      issueId,
      fieldIds: copiedFieldIds,
      values: copiedValues,
    });
    this.reader.apply(copiedFieldIds, copiedValues);
    return Promise.resolve();
  }
}

function boundary(options?: {
  initialIssue?: RedmineIssue;
  writeEnabled?: boolean;
  allowedProjects?: readonly string[];
  projectIdentifier?: string;
}): {
  boundary: AgentBriefLifecycleMetadataBoundary;
  reader: FakeReader;
  writer: FakeWriter;
} {
  const reader = new FakeReader(
    options?.initialIssue ?? issue(),
    options?.projectIdentifier,
  );
  const writer = new FakeWriter(reader);
  const writeGuard = new WriteGuard({
    writeEnabled: options?.writeEnabled ?? true,
    allowedProjects: options?.allowedProjects ?? ["mcp-test"],
  });

  return {
    boundary: new AgentBriefLifecycleMetadataBoundary(
      reader,
      writer,
      writeGuard,
    ),
    reader,
    writer,
  };
}

async function expectLifecycleError(
  promise: Promise<unknown>,
  code: AgentBriefLifecycleError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "AgentBriefLifecycleError",
    code,
  });
}

describe("AgentBriefLifecycleMetadataBoundary", () => {
  it("reads the logical lifecycle without treating unrelated fields as approval state", async () => {
    const { boundary: target } = boundary();

    const snapshot = await target.read(5366);

    expect(snapshot).toEqual({
      issueId: 5366,
      projectId: 1,
      projectName: "MCP Test Project",
      lifecycle: "Brief Draft",
      approvalMetadata: {},
      handoffEligible: false,
    });
  });

  it("fails closed when a required mapping is missing or ambiguous", async () => {
    const missing = issue();
    missing.customFields = missing.customFields.filter(
      ({ name }) => name !== AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt,
    );

    await expectLifecycleError(
      boundary({ initialIssue: missing }).boundary.read(5366),
      "lifecycle_mapping_missing",
    );

    const ambiguous = issue();
    ambiguous.customFields.push(
      field(777, AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle, "Brief Draft"),
    );

    await expectLifecycleError(
      boundary({ initialIssue: ambiguous }).boundary.read(5366),
      "lifecycle_mapping_ambiguous",
    );
  });

  it("rejects unknown lifecycle values", async () => {
    await expectLifecycleError(
      boundary({ initialIssue: issue("Running") }).boundary.read(5366),
      "unknown_lifecycle_state",
    );
  });

  it("writes only the lifecycle field for Brief Draft -> Brief Ready", async () => {
    const { boundary: target, writer } = boundary();

    const snapshot = await target.transition(5366, {
      targetLifecycle: "Brief Ready",
    });

    expect(snapshot.lifecycle).toBe("Brief Ready");
    expect(snapshot.handoffEligible).toBe(false);
    expect(writer.calls).toEqual([
      {
        issueId: 5366,
        fieldIds: EXPECTED_FIELD_IDS,
        values: {
          lifecycle: "Brief Ready",
        },
      },
    ]);
  });

  it("requires complete approval metadata for Ready for Agent and writes exactly the six Phase 38 fields", async () => {
    const { boundary: target, writer } = boundary({
      initialIssue: issue("Brief Ready"),
    });

    await expectLifecycleError(
      target.transition(5366, {
        targetLifecycle: "Ready for Agent",
      }),
      "approval_metadata_incomplete",
    );

    const snapshot = await target.transition(5366, {
      targetLifecycle: "Ready for Agent",
      approvalMetadata: COMPLETE_APPROVAL,
    });

    expect(snapshot.handoffEligible).toBe(true);
    expect(snapshot.approvalMetadata).toEqual(COMPLETE_APPROVAL);
    expect(writer.calls).toEqual([
      {
        issueId: 5366,
        fieldIds: EXPECTED_FIELD_IDS,
        values: {
          lifecycle: "Ready for Agent",
          approvedBy: COMPLETE_APPROVAL.approverIdentity,
          approvedAt: COMPLETE_APPROVAL.approvedAt,
          approvedBriefRevision: "3",
          approvedPersistedRevision:
            COMPLETE_APPROVAL.approvedPersistedRevision,
          approvedRequirementsFingerprint:
            COMPLETE_APPROVAL.approvedRequirementsFingerprint,
        },
      },
    ]);
    expect(Object.values(writer.calls[0]!.fieldIds)).not.toContain(999);
  });

  it("rejects invalid transitions without performing a write", async () => {
    const { boundary: target, writer } = boundary();

    await expectLifecycleError(
      target.transition(5366, {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: COMPLETE_APPROVAL,
      }),
      "invalid_lifecycle_transition",
    );

    expect(writer.calls).toHaveLength(0);
  });

  it("allows a review-required reset to Brief Draft without calculating staleness", async () => {
    const { boundary: target, writer } = boundary({
      initialIssue: issue("Ready for Agent", COMPLETE_APPROVAL),
    });

    const snapshot = await target.transition(5366, {
      targetLifecycle: "Brief Draft",
    });

    expect(snapshot.lifecycle).toBe("Brief Draft");
    expect(snapshot.handoffEligible).toBe(false);
    expect(snapshot.approvalMetadata).toEqual(COMPLETE_APPROVAL);
    expect(writer.calls[0]).toEqual({
      issueId: 5366,
      fieldIds: EXPECTED_FIELD_IDS,
      values: { lifecycle: "Brief Draft" },
    });
  });

  it("preserves the existing Write Guard write switch and project allowlist", async () => {
    const disabled = boundary({ writeEnabled: false });

    await expectLifecycleError(
      disabled.boundary.transition(5366, {
        targetLifecycle: "Brief Ready",
      }),
      "writes_disabled",
    );
    expect(disabled.writer.calls).toHaveLength(0);

    const disallowed = boundary({ allowedProjects: ["different-project"] });

    await expectLifecycleError(
      disallowed.boundary.transition(5366, {
        targetLifecycle: "Brief Ready",
      }),
      "project_not_allowed",
    );
    expect(disallowed.writer.calls).toHaveLength(0);
  });

  it("fails closed when Ready for Agent is observed with incomplete approval metadata", async () => {
    await expectLifecycleError(
      boundary({
        initialIssue: issue("Ready for Agent", {
          approverIdentity: "redmine-user:42",
        }),
      }).boundary.read(5366),
      "approval_metadata_incomplete",
    );
  });
});
