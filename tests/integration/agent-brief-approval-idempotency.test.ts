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

import { AgentBriefApprovalHandler } from "../../src/agent-brief/approval-handler.js";
import { AgentBriefApprovalIdempotencyHandler } from "../../src/agent-brief/approval-idempotency.js";
import { projectAgentBriefGenerationInput } from "../../src/agent-brief/generation-input.js";
import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleMetadataBoundary,
} from "../../src/agent-brief/lifecycle-metadata.js";
import {
  persistAgentBrief,
  readAgentBriefRevision,
  type AgentBriefPersistenceConfig,
} from "../../src/agent-brief/persistence.js";
import { calculateAgentBriefRequirementsFingerprint } from "../../src/agent-brief/requirements-fingerprint.js";
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

const PROJECT_IDENTIFIER = "mcp-agent-brief";
const FIXTURE_SUBJECT = "Agent Brief lifecycle metadata integration target";
const REPOSITORY = "mcp-mamono210/redmine";
const APPROVED_AT = "2026-09-07T13:30:00Z";
const REQUIREMENTS_INCLUDES = [
  "journals",
  "relations",
  "children",
] as const satisfies readonly RedmineIssueInclude[];

const { redmineUrl, writerApiKey } = getRedmineWriterTestEnvironment();
const writerClient = createWriterTestClient();
const writer = new RedmineHttpAgentBriefLifecycleWriter({
  baseUrl: redmineUrl,
  apiKey: writerApiKey,
});
const lifecycleBoundary = new AgentBriefLifecycleMetadataBoundary(
  writerClient,
  writer,
  new WriteGuard({
    writeEnabled: true,
    allowedProjects: [PROJECT_IDENTIFIER],
  }),
);

const temporaryRepositories: string[] = [];
let issueSummary: RedmineIssueSummary;
let fieldIds: Map<string, number>;

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-idempotency-"),
  );
  temporaryRepositories.push(repositoryRoot);

  git(repositoryRoot, ["init", "-b", "main"]);
  git(repositoryRoot, ["config", "user.name", "Agent Brief Test"]);
  git(repositoryRoot, [
    "config",
    "user.email",
    "agent-brief-test@example.invalid",
  ]);
  writeFileSync(join(repositoryRoot, "README.md"), "seed\n", "utf8");
  git(repositoryRoot, ["add", "README.md"]);
  git(repositoryRoot, ["commit", "-m", "seed"]);

  return repositoryRoot;
}

function persistenceConfig(repositoryRoot: string): AgentBriefPersistenceConfig {
  return {
    repositoryRoot,
    repository: REPOSITORY,
    canonicalBranch: "main",
  };
}

function requireFieldIds(issue: RedmineIssue): Map<string, number> {
  const result = new Map<string, number>();

  for (const name of Object.values(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES)) {
    const matches = issue.customFields.filter((field) => field.name === name);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one Agent Brief field named ${name}`);
    }
    result.set(name, matches[0]!.id);
  }

  return result;
}

function fieldId(name: string): number {
  const value = fieldIds.get(name);
  if (value === undefined) {
    throw new Error(`Missing Agent Brief field: ${name}`);
  }
  return value;
}

function resolvedFieldIds(): AgentBriefLifecycleCustomFieldIds {
  return {
    lifecycle: fieldId(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle),
    approvedBy: fieldId(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy),
    approvedAt: fieldId(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt),
    approvedBriefRevision: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
    ),
    approvedPersistedRevision: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
    ),
    approvedRequirementsFingerprint: fieldId(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedRequirementsFingerprint,
    ),
  };
}

async function findIssue(): Promise<RedmineIssueSummary> {
  const response = await writerClient.listIssues({
    projectId: PROJECT_IDENTIFIER,
    subject: FIXTURE_SUBJECT,
    limit: 10,
  });
  const issue = response.items.find(({ subject }) => subject === FIXTURE_SUBJECT);
  if (!issue) {
    throw new Error("Agent Brief integration fixture was not found");
  }
  return issue;
}

async function resetIssue(): Promise<void> {
  await writer.updateAgentBriefLifecycleFields(
    issueSummary.id,
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

function briefMarkdown(issueId: number, fingerprint: string): string {
  return `---
format_version: 1
redmine_issue_id: ${issueId}
repository: ${REPOSITORY}
brief_revision: 1
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Verify Phase 41 duplicate approval reconciliation.

### Context

The exact completed approval must converge without a second write.

### In Scope

- Duplicate approval reconciliation.

### Out of Scope

- Ambiguous write retry.
- Agent execution.

### Requirements

- Preserve the original approval fact.

### Architecture / Contract Constraints

- Reuse Phase 37-40 boundaries.

### Acceptance Criteria

- [ ] AC-1: An exact duplicate returns approved without rewriting metadata.

### Verification

- AC-1: Reinvoke approval after Ready for Agent.

### Deliverables

- Deterministic duplicate approval result.

### Unresolved / Blocking

None.
`;
}

async function persistCurrentBrief(config: AgentBriefPersistenceConfig) {
  const issue = await writerClient.getIssue(issueSummary.id, {
    include: REQUIREMENTS_INCLUDES,
  });
  const fingerprint = calculateAgentBriefRequirementsFingerprint(
    projectAgentBriefGenerationInput(issue),
  );
  const persisted = await persistAgentBrief(
    config,
    briefMarkdown(issue.id, fingerprint),
  );
  return { fingerprint, persistedRevision: persisted.persistedRevision };
}

function createIdempotentHandler(config: AgentBriefPersistenceConfig) {
  const readPersistedBrief = (issueId: number, briefRevision: number) =>
    readAgentBriefRevision(config, issueId, briefRevision);
  const phase40Handler = new AgentBriefApprovalHandler(
    writerClient,
    lifecycleBoundary,
    readPersistedBrief,
    { clock: () => APPROVED_AT },
  );

  return new AgentBriefApprovalIdempotencyHandler(
    phase40Handler,
    writerClient,
    lifecycleBoundary,
    readPersistedBrief,
    { repository: REPOSITORY },
  );
}

beforeAll(async () => {
  issueSummary = await findIssue();
  fieldIds = requireFieldIds(await writerClient.getIssue(issueSummary.id));
});

beforeEach(async () => {
  await resetIssue();
});

afterEach(async () => {
  await resetIssue();
  while (temporaryRepositories.length > 0) {
    const repositoryRoot = temporaryRepositories.pop();
    if (repositoryRoot !== undefined) {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  }
});

afterAll(async () => {
  await resetIssue();
});

describe("Agent Brief approval idempotency integration", () => {
  it("returns the original approval on an exact duplicate without rewriting approved_at", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { fingerprint, persistedRevision } = await persistCurrentBrief(config);

    await lifecycleBoundary.transition(issueSummary.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createIdempotentHandler(config);
    const request = {
      issueId: issueSummary.id,
      briefRevision: 1,
      persistedRevision,
    };

    const first = await handler.approve(request);
    expect(first).toMatchObject({
      outcome: "approved",
      requirementsFingerprint: fingerprint,
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });

    const duplicate = await handler.approve(request);
    expect(duplicate).toEqual(first);

    const verified = await lifecycleBoundary.read(issueSummary.id);
    expect(verified).toMatchObject({
      lifecycle: "Ready for Agent",
      handoffEligible: true,
      approvalMetadata: {
        approvedAt: APPROVED_AT,
        approvedBriefRevision: 1,
        approvedPersistedRevision: persistedRevision,
        approvedRequirementsFingerprint: fingerprint,
      },
    });
  });

  it("returns approval_conflict instead of rewriting a different approval fact", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const { fingerprint, persistedRevision } = await persistCurrentBrief(config);

    await lifecycleBoundary.transition(issueSummary.id, {
      targetLifecycle: "Brief Ready",
    });

    const handler = createIdempotentHandler(config);
    const request = {
      issueId: issueSummary.id,
      briefRevision: 1,
      persistedRevision,
    };
    await expect(handler.approve(request)).resolves.toMatchObject({
      outcome: "approved",
    });

    await writer.updateAgentBriefLifecycleFields(
      issueSummary.id,
      resolvedFieldIds(),
      {
        lifecycle: "Ready for Agent",
        approvedBy: "redmine-user:999",
        approvedAt: APPROVED_AT,
        approvedBriefRevision: "1",
        approvedPersistedRevision: `${persistedRevision}-different`,
        approvedRequirementsFingerprint: fingerprint,
      },
    );

    await expect(handler.approve(request)).resolves.toMatchObject({
      outcome: "validation_failed",
      reason: "approval_conflict",
      handoffEligible: false,
    });

    const verified = await lifecycleBoundary.read(issueSummary.id);
    expect(verified.approvalMetadata).toMatchObject({
      approverIdentity: "redmine-user:999",
      approvedAt: APPROVED_AT,
      approvedBriefRevision: 1,
      approvedPersistedRevision: `${persistedRevision}-different`,
      approvedRequirementsFingerprint: fingerprint,
    });
  });
});
