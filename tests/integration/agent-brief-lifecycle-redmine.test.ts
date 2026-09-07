import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleMetadataBoundary,
  type AgentBriefApprovalMetadata,
} from "../../src/agent-brief/lifecycle-metadata.js";
import { WriteGuard } from "../../src/mcp/write-guard.js";
import {
  RedmineHttpAgentBriefLifecycleWriter,
  type AgentBriefLifecycleCustomFieldIds,
} from "../../src/redmine/issue-custom-field-writer.js";
import type {
  RedmineIssue,
  RedmineIssueSummary,
} from "../../src/redmine/types.js";
import {
  createReadOnlyTestClient,
  createWriterTestClient,
  getRedmineWriterTestEnvironment,
} from "../helpers/redmine-environment.js";

const AGENT_BRIEF_TEST_PROJECT_IDENTIFIER = "mcp-agent-brief";
const AGENT_BRIEF_FIXTURE_SUBJECT =
  "Agent Brief lifecycle metadata integration target";
const FINGERPRINT = `sha256:${"b".repeat(64)}`;

const { redmineUrl, writerApiKey } =
  getRedmineWriterTestEnvironment();
const readOnlyClient = createReadOnlyTestClient();
const writerClient = createWriterTestClient();
const writer = new RedmineHttpAgentBriefLifecycleWriter({
  baseUrl: redmineUrl,
  apiKey: writerApiKey,
});
const writeGuard = new WriteGuard({
  writeEnabled: true,
  allowedProjects: [AGENT_BRIEF_TEST_PROJECT_IDENTIFIER],
});
const boundary = new AgentBriefLifecycleMetadataBoundary(
  writerClient,
  writer,
  writeGuard,
);
const deniedBoundary = new AgentBriefLifecycleMetadataBoundary(
  writerClient,
  writer,
  new WriteGuard({
    writeEnabled: true,
    allowedProjects: [],
  }),
);

let agentBriefIssue: RedmineIssueSummary;
let agentBriefFieldIds: Map<string, number>;
let releaseTag: string | string[] | undefined;

function requireCanonicalFieldIds(
  issue: RedmineIssue,
): Map<string, number> {
  const names = Object.values(
    AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  );
  const result = new Map<string, number>();

  for (const name of names) {
    const matches = issue.customFields.filter(
      (field) => field.name === name,
    );

    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one seeded Agent Brief custom field named ${name}`,
      );
    }

    result.set(name, matches[0]!.id);
  }

  return result;
}

function fieldId(name: string): number {
  const id = agentBriefFieldIds.get(name);

  if (id === undefined) {
    throw new Error(`Missing seeded field ID: ${name}`);
  }

  return id;
}

function resolvedFieldIds(): AgentBriefLifecycleCustomFieldIds {
  return {
    lifecycle: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle,
    ),
    approvedBy: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy,
    ),
    approvedAt: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt,
    ),
    approvedBriefRevision: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
    ),
    approvedPersistedRevision: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
    ),
    approvedRequirementsFingerprint: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES
        .approvedRequirementsFingerprint,
    ),
  };
}

async function findAgentBriefIssue(): Promise<RedmineIssueSummary> {
  const response = await writerClient.listIssues({
    projectId: AGENT_BRIEF_TEST_PROJECT_IDENTIFIER,
    subject: AGENT_BRIEF_FIXTURE_SUBJECT,
    limit: 10,
  });
  const issue = response.items.find(
    ({ subject }) => subject === AGENT_BRIEF_FIXTURE_SUBJECT,
  );

  if (!issue) {
    throw new Error("Agent Brief lifecycle seeded issue was not found");
  }

  return issue;
}

async function resetAgentBriefIssue(): Promise<void> {
  await writer.updateAgentBriefLifecycleFields(
    agentBriefIssue.id,
    resolvedFieldIds(),
    {
      lifecycle: "Brief Draft",
      approvedBy: "",
      approvedAt: "",
      approvedBriefRevision: "",
      approvedPersistedRevision: "",
      approvedRequirementsFingerprint: "",
    },
  );
}

beforeAll(async () => {
  const readOnlyProjects = await readOnlyClient.listProjects({
    limit: 100,
  });

  expect(
    readOnlyProjects.items.some(
      ({ identifier }) =>
        identifier === AGENT_BRIEF_TEST_PROJECT_IDENTIFIER,
    ),
  ).toBe(false);

  agentBriefIssue = await findAgentBriefIssue();

  const issue = await writerClient.getIssue(agentBriefIssue.id);
  agentBriefFieldIds = requireCanonicalFieldIds(issue);
  releaseTag = issue.customFields.find(
    ({ name }) => name === "release_tag",
  )?.value;
});

beforeEach(async () => {
  await resetAgentBriefIssue();
});

afterAll(async () => {
  await resetAgentBriefIssue();
});

describe("Agent Brief lifecycle Redmine integration", () => {
  it("reads the isolated lifecycle mapping, performs allowed transitions, and persists a traceable approval record", async () => {
    const initial = await boundary.read(agentBriefIssue.id);
    expect(initial.lifecycle).toBe("Brief Draft");
    expect(initial.handoffEligible).toBe(false);

    const ready = await boundary.transition(
      agentBriefIssue.id,
      {
        targetLifecycle: "Brief Ready",
      },
    );
    expect(ready.lifecycle).toBe("Brief Ready");
    expect(ready.handoffEligible).toBe(false);

    await expect(
      boundary.transition(agentBriefIssue.id, {
        targetLifecycle: "Ready for Agent",
      }),
    ).rejects.toMatchObject({
      code: "approval_metadata_incomplete",
    });

    const writerUser = await writerClient.getCurrentUser();
    const approval: AgentBriefApprovalMetadata = {
      approverIdentity: `redmine-user:${writerUser.id}`,
      approvedAt: "2026-09-07T04:00:00Z",
      approvedBriefRevision: 2,
      approvedPersistedRevision:
        "phase-38-integration-persisted-revision",
      approvedRequirementsFingerprint: FINGERPRINT,
    };

    const approved = await boundary.transition(
      agentBriefIssue.id,
      {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: approval,
      },
    );

    expect(approved.lifecycle).toBe("Ready for Agent");
    expect(approved.handoffEligible).toBe(true);
    expect(approved.approvalMetadata).toEqual(approval);

    const reread = await boundary.read(agentBriefIssue.id);
    expect(
      reread.approvalMetadata.approvedBriefRevision,
    ).toBe(2);
    expect(
      reread.approvalMetadata.approvedPersistedRevision,
    ).toBe("phase-38-integration-persisted-revision");

    const rawIssue = await writerClient.getIssue(
      agentBriefIssue.id,
    );
    expect(
      rawIssue.customFields.find(
        ({ name }) => name === "release_tag",
      )?.value,
    ).toEqual(releaseTag);
  });

  it("rejects invalid transitions before mutating Redmine", async () => {
    await expect(
      boundary.transition(agentBriefIssue.id, {
        targetLifecycle: "Ready for Agent",
        approvalMetadata: {
          approverIdentity: "redmine-user:1",
          approvedAt: "2026-09-07T04:00:00Z",
          approvedBriefRevision: 1,
          approvedPersistedRevision:
            "invalid-direct-transition",
          approvedRequirementsFingerprint: FINGERPRINT,
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_lifecycle_transition",
    });

    const snapshot = await boundary.read(agentBriefIssue.id);
    expect(snapshot.lifecycle).toBe("Brief Draft");
    expect(snapshot.approvalMetadata).toEqual({});
  });

  it("enforces the existing Write Guard project boundary before a writer request", async () => {
    const before = await boundary.read(agentBriefIssue.id);
    expect(before.lifecycle).toBe("Brief Draft");

    await expect(
      deniedBoundary.transition(agentBriefIssue.id, {
        targetLifecycle: "Brief Ready",
      }),
    ).rejects.toMatchObject({
      code: "project_not_allowed",
    });

    const after = await boundary.read(agentBriefIssue.id);
    expect(after.lifecycle).toBe("Brief Draft");
    expect(after.approvalMetadata).toEqual({});
  });
});
