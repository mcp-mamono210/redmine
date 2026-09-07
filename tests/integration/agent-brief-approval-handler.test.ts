import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  AgentBriefApprovalHandler,
} from "../../src/agent-brief/approval-handler.js";
import {
  projectAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleMetadataBoundary,
} from "../../src/agent-brief/lifecycle-metadata.js";
import {
  persistAgentBrief,
  readAgentBriefRevision,
  type AgentBriefPersistenceConfig,
} from "../../src/agent-brief/persistence.js";
import {
  calculateAgentBriefRequirementsFingerprint,
} from "../../src/agent-brief/requirements-fingerprint.js";
import { WriteGuard } from "../../src/mcp/write-guard.js";
import {
  RedmineHttpAgentBriefLifecycleWriter,
  type AgentBriefLifecycleCustomFieldIds,
} from "../../src/redmine/issue-custom-field-writer.js";
import type {
  RedmineIssue,
  RedmineIssueInclude,
  RedmineIssueSummary,
} from "../../src/redmine/types.js";
import {
  createWriterTestClient,
  getRedmineWriterTestEnvironment,
} from "../helpers/redmine-environment.js";

const AGENT_BRIEF_TEST_PROJECT_IDENTIFIER = "mcp-agent-brief";
const AGENT_BRIEF_FIXTURE_SUBJECT =
  "Agent Brief lifecycle metadata integration target";
const APPROVED_AT = "2026-09-07T09:00:00Z";
const REPOSITORY = "mcp-mamono210/redmine";
const REQUIREMENTS_INCLUDES = [
  "journals",
  "relations",
  "children",
] as const satisfies readonly RedmineIssueInclude[];

const { redmineUrl, writerApiKey } =
  getRedmineWriterTestEnvironment();
const writerClient = createWriterTestClient();
const writer = new RedmineHttpAgentBriefLifecycleWriter({
  baseUrl: redmineUrl,
  apiKey: writerApiKey,
});
const writeGuard = new WriteGuard({
  writeEnabled: true,
  allowedProjects: [AGENT_BRIEF_TEST_PROJECT_IDENTIFIER],
});
const lifecycleBoundary = new AgentBriefLifecycleMetadataBoundary(
  writerClient,
  writer,
  writeGuard,
);
const deniedLifecycleBoundary = new AgentBriefLifecycleMetadataBoundary(
  writerClient,
  writer,
  new WriteGuard({
    writeEnabled: true,
    allowedProjects: [],
  }),
);

const temporaryRepositories: string[] = [];
let agentBriefIssue: RedmineIssueSummary;
let agentBriefFieldIds: Map<string, number>;
let releaseTag: string | string[] | undefined;

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-approval-handler-"),
  );
  temporaryRepositories.push(repositoryRoot);

  git(repositoryRoot, ["init", "-b", "main"]);
  git(repositoryRoot, ["config", "user.name", "Agent Brief Test"]);
  git(repositoryRoot, [
    "config",
    "user.email",
    "agent-brief-test@example.invalid",
  ]);
  writeFileSync(
    join(repositoryRoot, "README.md"),
    "seed\n",
    "utf8",
  );
  git(repositoryRoot, ["add", "README.md"]);
  git(repositoryRoot, ["commit", "-m", "seed"]);

  return repositoryRoot;
}

function persistenceConfig(
  repositoryRoot: string,
): AgentBriefPersistenceConfig {
  return {
    repositoryRoot,
    repository: REPOSITORY,
    canonicalBranch: "main",
  };
}

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

async function currentRequirementsIssue(): Promise<RedmineIssue> {
  return writerClient.getIssue(agentBriefIssue.id, {
    include: REQUIREMENTS_INCLUDES,
  });
}

function briefMarkdown(
  issueId: number,
  fingerprint: string,
): string {
  return `---
format_version: 1
redmine_issue_id: ${issueId}
repository: ${REPOSITORY}
brief_revision: 1
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Validate the exact reviewed Brief before Agent handoff eligibility.

### Context

Phase 40 orchestrates existing persistence, lifecycle, and staleness boundaries.

### In Scope

- Validate the exact persisted review target.
- Approve CURRENT requirements or reset STALE requirements.

### Out of Scope

- Public MCP Tool registration.
- Retry and recovery.
- Agent execution.

### Requirements

- CURRENT may become Ready for Agent.
- STALE must return to Brief Draft.

### Architecture / Contract Constraints

- Reuse Phase 37 persistence and Phase 38 guarded lifecycle writes.
- Reuse Phase 39 staleness detection semantics.

### Acceptance Criteria

- [ ] AC-1: Approval orchestration preserves the Phase 38 and 39 boundaries.

### Verification

- AC-1: Execute the Handler against seeded Redmine and a real temporary Git store.

### Deliverables

- A verified approval or stale result.

### Unresolved / Blocking

None.
`;
}

async function persistCurrentBrief(
  config: AgentBriefPersistenceConfig,
): Promise<{
  persistedRevision: string;
  fingerprint: string;
}> {
  const issue = await currentRequirementsIssue();
  const input = projectAgentBriefGenerationInput(issue);
  const fingerprint =
    calculateAgentBriefRequirementsFingerprint(input);
  const persisted = await persistAgentBrief(
    config,
    briefMarkdown(issue.id, fingerprint),
  );

  return {
    persistedRevision: persisted.persistedRevision,
    fingerprint,
  };
}

function createHandler(
  config: AgentBriefPersistenceConfig,
  options?: {
    lifecycleBoundary?: AgentBriefLifecycleMetadataBoundary;
    issueTransform?: (issue: RedmineIssue) => RedmineIssue;
  },
): AgentBriefApprovalHandler {
  const redmineReader = {
    getIssue: async (
      issueId: number,
      requestOptions?: {
        include?: readonly RedmineIssueInclude[];
      },
    ): Promise<RedmineIssue> => {
      const issue = await writerClient.getIssue(
        issueId,
        requestOptions,
      );
      return options?.issueTransform === undefined
        ? issue
        : options.issueTransform(structuredClone(issue));
    },
    getCurrentUser: () => writerClient.getCurrentUser(),
  };

  return new AgentBriefApprovalHandler(
    redmineReader,
    options?.lifecycleBoundary ?? lifecycleBoundary,
    (issueId, briefRevision) =>
      readAgentBriefRevision(config, issueId, briefRevision),
    {
      clock: () => APPROVED_AT,
    },
  );
}

beforeAll(async () => {
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

afterEach(async () => {
  await resetAgentBriefIssue();

  while (temporaryRepositories.length > 0) {
    const repositoryRoot = temporaryRepositories.pop();
    if (repositoryRoot !== undefined) {
      rmSync(repositoryRoot, {
        recursive: true,
        force: true,
      });
    }
  }
});

afterAll(async () => {
  await resetAgentBriefIssue();
});

describe("Agent Brief Approval Handler integration", () => {
  it("connects Phase 37, 38, and 39 and persists a traceable CURRENT approval", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { persistedRevision, fingerprint } =
      await persistCurrentBrief(config);

    await lifecycleBoundary.transition(agentBriefIssue.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createHandler(config);
    const result = await handler.approve({
      issueId: agentBriefIssue.id,
      briefRevision: 1,
      persistedRevision,
    });
    const writerUser = await writerClient.getCurrentUser();

    expect(result).toEqual({
      outcome: "approved",
      issueId: agentBriefIssue.id,
      briefRevision: 1,
      persistedRevision,
      requirementsFingerprint: fingerprint,
      lifecycle: "Ready for Agent",
      approverIdentity: `redmine-user:${writerUser.id}`,
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });

    const verified = await lifecycleBoundary.read(
      agentBriefIssue.id,
    );
    expect(verified).toMatchObject({
      lifecycle: "Ready for Agent",
      handoffEligible: true,
      approvalMetadata: {
        approverIdentity: `redmine-user:${writerUser.id}`,
        approvedAt: APPROVED_AT,
        approvedBriefRevision: 1,
        approvedPersistedRevision: persistedRevision,
        approvedRequirementsFingerprint: fingerprint,
      },
    });

    const rawIssue = await writerClient.getIssue(agentBriefIssue.id);
    expect(
      rawIssue.customFields.find(
        ({ name }) => name === "release_tag",
      )?.value,
    ).toEqual(releaseTag);
  });

  it("resets a true STALE result to Brief Draft without writing approval metadata", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { persistedRevision } = await persistCurrentBrief(config);

    await lifecycleBoundary.transition(agentBriefIssue.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createHandler(config, {
      issueTransform: (issue) => ({
        ...issue,
        description:
          `${issue.description ?? ""}\nMaterial requirement changed after review.`,
      }),
    });

    const result = await handler.approve({
      issueId: agentBriefIssue.id,
      briefRevision: 1,
      persistedRevision,
    });

    expect(result).toMatchObject({
      outcome: "stale",
      issueId: agentBriefIssue.id,
      briefRevision: 1,
      persistedRevision,
      lifecycle: "Brief Draft",
      handoffEligible: false,
    });

    const verified = await lifecycleBoundary.read(
      agentBriefIssue.id,
    );
    expect(verified.lifecycle).toBe("Brief Draft");
    expect(verified.handoffEligible).toBe(false);
    expect(verified.approvalMetadata).toEqual({});
  });

  it("rejects a different reviewed persisted revision without mutating Brief Ready", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { persistedRevision } = await persistCurrentBrief(config);

    await lifecycleBoundary.transition(agentBriefIssue.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createHandler(config);
    const result = await handler.approve({
      issueId: agentBriefIssue.id,
      briefRevision: 1,
      persistedRevision: `${persistedRevision}-different`,
    });

    expect(result).toMatchObject({
      outcome: "validation_failed",
      reason: "reviewed_reference_invalid",
      handoffEligible: false,
    });

    const verified = await lifecycleBoundary.read(
      agentBriefIssue.id,
    );
    expect(verified.lifecycle).toBe("Brief Ready");
    expect(verified.handoffEligible).toBe(false);
    expect(verified.approvalMetadata).toEqual({});
  });

  it("cannot bypass the existing Phase 38 project allowlist", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { persistedRevision } = await persistCurrentBrief(config);

    await lifecycleBoundary.transition(agentBriefIssue.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createHandler(config, {
      lifecycleBoundary: deniedLifecycleBoundary,
    });

    await expect(
      handler.approve({
        issueId: agentBriefIssue.id,
        briefRevision: 1,
        persistedRevision,
      }),
    ).rejects.toMatchObject({
      name: "AgentBriefApprovalHandlerError",
      code: "project_not_allowed",
    });

    const verified = await lifecycleBoundary.read(
      agentBriefIssue.id,
    );
    expect(verified.lifecycle).toBe("Brief Ready");
    expect(verified.handoffEligible).toBe(false);
    expect(verified.approvalMetadata).toEqual({});
  });
});
