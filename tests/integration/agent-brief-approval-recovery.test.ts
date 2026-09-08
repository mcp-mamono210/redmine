import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { AgentBriefApprovalRecoveryLifecycleBoundary } from "../../src/agent-brief/approval-recovery.js";
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
import { RedmineNetworkError } from "../../src/redmine/errors.js";
import {
  RedmineHttpAgentBriefLifecycleWriter,
  type AgentBriefLifecycleCustomFieldIds,
  type AgentBriefLifecycleCustomFieldValues,
  type AgentBriefLifecycleRedmineWriter,
} from "../../src/redmine/issue-custom-field-writer.js";
import type { RedmineIssue, RedmineIssueSummary } from "../../src/redmine/types.js";
import {
  createWriterTestClient,
  getRedmineWriterTestEnvironment,
} from "../helpers/redmine-environment.js";

const PROJECT_IDENTIFIER = "mcp-agent-brief";
const FIXTURE_SUBJECT = "Agent Brief lifecycle metadata integration target";
const REPOSITORY = "mcp-mamono210/redmine";
const APPROVED_AT = "2026-09-07T14:45:00Z";

const { redmineUrl, writerApiKey } = getRedmineWriterTestEnvironment();
const writerClient = createWriterTestClient();
const writeGuard = new WriteGuard({
  writeEnabled: true,
  allowedProjects: [PROJECT_IDENTIFIER],
});

let issueSummary: RedmineIssueSummary;
let fieldIds: AgentBriefLifecycleCustomFieldIds;
let repositoryRoot: string;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-brief-recovery-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Recovery Test"]);
  git(root, ["config", "user.email", "recovery@example.invalid"]);
  writeFileSync(join(root, "README.md"), "seed\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "seed"]);
  return root;
}

function resolveFieldIds(issue: RedmineIssue): AgentBriefLifecycleCustomFieldIds {
  const idFor = (name: string): number => {
    const matches = issue.customFields.filter((field) => field.name === name);
    if (matches.length !== 1) {
      throw new Error(`Expected one field named ${name}`);
    }
    return matches[0]!.id;
  };

  return {
    lifecycle: idFor(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle),
    approvedBy: idFor(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy),
    approvedAt: idFor(AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt),
    approvedBriefRevision: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
    ),
    approvedPersistedRevision: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
    ),
    approvedRequirementsFingerprint: idFor(
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
  const issue = response.items.find((item) => item.subject === FIXTURE_SUBJECT);
  if (issue === undefined) {
    throw new Error("Agent Brief recovery fixture was not found");
  }
  return issue;
}

function persistenceConfig(): AgentBriefPersistenceConfig {
  return {
    repositoryRoot,
    repository: REPOSITORY,
    canonicalBranch: "main",
  };
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

Verify bounded approval write recovery.

### Context

Phase 41-3 recovers ambiguous Redmine writes by read-back reconciliation.

### In Scope

- Approval write recovery.

### Out of Scope

- Agent execution.

### Requirements

- Never perform an unbounded retry.

### Architecture / Contract Constraints

- Reuse the Phase 38 guarded lifecycle boundary.

### Acceptance Criteria

- [ ] AC-1: Response loss after commit converges without duplicate write.
- [ ] AC-2: A confirmed pre-commit loss allows at most one recovery write.
- [ ] AC-3: Repeated ambiguous writes stop without reporting approval success.

### Verification

- AC-1: Fault-inject a response loss after the real Redmine update.
- AC-2: Fault-inject one pre-commit loss and verify exactly two write attempts.
- AC-3: Fault-inject two pre-commit losses and verify bounded failure plus Brief Ready read-back.

### Deliverables

- Recovery integration coverage.

### Unresolved / Blocking

None.
`;
}

class FaultInjectingWriter implements AgentBriefLifecycleRedmineWriter {
  calls = 0;

  constructor(
    private readonly inner: AgentBriefLifecycleRedmineWriter,
    private readonly mode:
      | "commit-then-lose-response"
      | "lose-before-commit-once"
      | "lose-before-commit-always",
  ) {}

  async updateAgentBriefLifecycleFields(
    issueId: number,
    ids: AgentBriefLifecycleCustomFieldIds,
    values: AgentBriefLifecycleCustomFieldValues,
  ): Promise<void> {
    this.calls += 1;

    if (
      (this.mode === "lose-before-commit-once" && this.calls === 1) ||
      this.mode === "lose-before-commit-always"
    ) {
      throw new RedmineNetworkError(
        "fault injected before response",
        "PUT",
        `/issues/${issueId}.json`,
      );
    }

    await this.inner.updateAgentBriefLifecycleFields(issueId, ids, values);

    if (this.mode === "commit-then-lose-response" && this.calls === 1) {
      throw new RedmineNetworkError(
        "fault injected after commit",
        "PUT",
        `/issues/${issueId}.json`,
      );
    }
  }
}

async function resetIssue(writer: AgentBriefLifecycleRedmineWriter): Promise<void> {
  await writer.updateAgentBriefLifecycleFields(issueSummary.id, fieldIds, {
    lifecycle: "Brief Draft",
    approvedBy: "",
    approvedAt: "",
    approvedBriefRevision: "",
    approvedPersistedRevision: "",
    approvedRequirementsFingerprint: "",
  });
}

async function preparePersistedBrief(): Promise<{ persistedRevision: string; fingerprint: string }> {
  const current = await writerClient.getIssue(issueSummary.id, {
    include: ["journals", "relations", "children"],
  });
  const fingerprint = calculateAgentBriefRequirementsFingerprint(
    projectAgentBriefGenerationInput(current),
  );
  const persisted = await persistAgentBrief(
    persistenceConfig(),
    briefMarkdown(issueSummary.id, fingerprint),
  );
  return { persistedRevision: persisted.persistedRevision, fingerprint };
}

function createRecoveryHandler(
  faultWriter: AgentBriefLifecycleRedmineWriter,
): AgentBriefApprovalHandler {
  const base = new AgentBriefLifecycleMetadataBoundary(
    writerClient,
    faultWriter,
    writeGuard,
  );
  const readPersisted = (issueId: number, briefRevision: number) =>
    readAgentBriefRevision(persistenceConfig(), issueId, briefRevision);
  const recovery = new AgentBriefApprovalRecoveryLifecycleBoundary(
    base,
    writerClient,
    readPersisted,
    { repository: REPOSITORY },
  );

  return new AgentBriefApprovalHandler(
    writerClient,
    recovery,
    readPersisted,
    { clock: () => APPROVED_AT },
  );
}

beforeAll(async () => {
  issueSummary = await findIssue();
  fieldIds = resolveFieldIds(await writerClient.getIssue(issueSummary.id));
});

beforeEach(async () => {
  repositoryRoot = createRepository();
  const writer = new RedmineHttpAgentBriefLifecycleWriter({
    baseUrl: redmineUrl,
    apiKey: writerApiKey,
  });
  await resetIssue(writer);
  const boundary = new AgentBriefLifecycleMetadataBoundary(
    writerClient,
    writer,
    writeGuard,
  );
  await boundary.transition(issueSummary.id, { targetLifecycle: "Brief Ready" });
});

afterEach(async () => {
  const writer = new RedmineHttpAgentBriefLifecycleWriter({
    baseUrl: redmineUrl,
    apiKey: writerApiKey,
  });
  await resetIssue(writer).catch(() => undefined);
  rmSync(repositoryRoot, { recursive: true, force: true });
});

afterAll(async () => {
  const writer = new RedmineHttpAgentBriefLifecycleWriter({
    baseUrl: redmineUrl,
    apiKey: writerApiKey,
  });
  await resetIssue(writer).catch(() => undefined);
});

describe("Agent Brief approval recovery integration", () => {
  it("reconciles a committed approval after response loss without writing twice", async () => {
    const { persistedRevision, fingerprint } = await preparePersistedBrief();
    const realWriter = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: redmineUrl,
      apiKey: writerApiKey,
    });
    const faultWriter = new FaultInjectingWriter(
      realWriter,
      "commit-then-lose-response",
    );
    const handler = createRecoveryHandler(faultWriter);

    const result = await handler.approve({
      issueId: issueSummary.id,
      briefRevision: 1,
      persistedRevision,
    });

    expect(result).toMatchObject({
      outcome: "approved",
      persistedRevision,
      requirementsFingerprint: fingerprint,
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });
    expect(faultWriter.calls).toBe(1);
  }, 15_000);

  it("performs exactly one recovery write after a pre-commit network loss", async () => {
    const { persistedRevision } = await preparePersistedBrief();
    const realWriter = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: redmineUrl,
      apiKey: writerApiKey,
    });
    const faultWriter = new FaultInjectingWriter(
      realWriter,
      "lose-before-commit-once",
    );
    const handler = createRecoveryHandler(faultWriter);

    await expect(
      handler.approve({
        issueId: issueSummary.id,
        briefRevision: 1,
        persistedRevision,
      }),
    ).resolves.toMatchObject({
      outcome: "approved",
      approvedAt: APPROVED_AT,
      handoffEligible: true,
    });
    expect(faultWriter.calls).toBe(2);
  }, 15_000);

  it("stops after the bounded recovery retry when both write attempts are ambiguous", async () => {
    const { persistedRevision } = await preparePersistedBrief();
    const realWriter = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: redmineUrl,
      apiKey: writerApiKey,
    });
    const faultWriter = new FaultInjectingWriter(
      realWriter,
      "lose-before-commit-always",
    );
    const handler = createRecoveryHandler(faultWriter);

    await expect(
      handler.approve({
        issueId: issueSummary.id,
        briefRevision: 1,
        persistedRevision,
      }),
    ).rejects.toMatchObject({
      name: "AgentBriefApprovalHandlerError",
      code: "lifecycle_transition_failed",
    });
    expect(faultWriter.calls).toBe(2);

    const verifiedBoundary = new AgentBriefLifecycleMetadataBoundary(
      writerClient,
      realWriter,
      writeGuard,
    );
    const verified = await verifiedBoundary.read(issueSummary.id);
    expect(verified).toMatchObject({
      lifecycle: "Brief Ready",
      handoffEligible: false,
      approvalMetadata: {},
    });
  }, 15_000);
});
