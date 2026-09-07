import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  projectAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  AGENT_BRIEF_LIFECYCLE_FIELD_NAMES,
  AgentBriefLifecycleMetadataBoundary,
} from "../../src/agent-brief/lifecycle-metadata.js";
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
  RedmineIssueSummary,
} from "../../src/redmine/types.js";
import {
  createWriterTestClient,
  getRedmineWriterTestEnvironment,
} from "../helpers/redmine-environment.js";
import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

const PROJECT_IDENTIFIER = "mcp-agent-brief";
const FIXTURE_SUBJECT =
  "Agent Brief lifecycle metadata integration target";
const REPOSITORY = "mcp-mamono210/redmine";
const BRIEF_REVISION = 1;

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-approval-e2e-"),
  );

  git(repositoryRoot, ["init", "-b", "main"]);
  git(repositoryRoot, ["config", "user.name", "Agent Brief E2E"]);
  git(repositoryRoot, [
    "config",
    "user.email",
    "agent-brief-e2e@example.invalid",
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

function briefMarkdown(
  issueId: number,
  fingerprint: string,
): string {
  return `---
format_version: 1
redmine_issue_id: ${issueId}
repository: ${REPOSITORY}
brief_revision: ${BRIEF_REVISION}
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Approve one explicitly reviewed persisted Agent Brief through the MCP entry point.

### Context

Phase 40-3 exposes the Phase 40-2 Approval Handler through one guarded MCP Tool.

### In Scope

- Validate the exact reviewed persisted reference.
- Return a bounded explicit approval outcome.

### Out of Scope

- Agent execution.
- Phase 41 idempotency and recovery.

### Requirements

- Delegate approval business rules to the Phase 40 Approval Handler.
- Preserve the Phase 38 Write Guard and lifecycle boundary.

### Architecture / Contract Constraints

- Do not expose a generic lifecycle or custom-field writer.
- Do not duplicate staleness or lifecycle business logic in the MCP adapter.

### Acceptance Criteria

- [ ] AC-1: A CURRENT reviewed Brief can reach Ready for Agent through the explicit MCP Tool.
- [ ] AC-2: An invalid reviewed reference does not grant handoff eligibility.

### Verification

- AC-1: Exercise redmine_approve_agent_brief against the seeded Redmine fixture.
- AC-2: Call the Tool with a mismatched persisted revision before the valid call.

### Deliverables

- The explicit approval MCP entry point.
- End-to-end regression coverage.

### Unresolved / Blocking

None.
`;
}

function writeBriefRevision(
  repositoryRoot: string,
  issueId: number,
  markdown: string,
): string {
  const artifactPath =
    `docs/agent-briefs/${issueId}/revisions/${BRIEF_REVISION}.md`;
  const localPath = join(repositoryRoot, artifactPath);

  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, markdown, "utf8");
  git(repositoryRoot, ["add", artifactPath]);
  git(repositoryRoot, ["commit", "-m", "persist reviewed Agent Brief"]);

  return git(repositoryRoot, [
    "rev-parse",
    `main:${artifactPath}`,
  ]).trim();
}

function requireLifecycleFieldIds(
  issue: RedmineIssue,
): AgentBriefLifecycleCustomFieldIds {
  const idFor = (name: string): number => {
    const matches = issue.customFields.filter(
      (field) => field.name === name,
    );

    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one seeded Agent Brief field named ${name}`,
      );
    }

    return matches[0]!.id;
  };

  return {
    lifecycle: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.lifecycle,
    ),
    approvedBy: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBy,
    ),
    approvedAt: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedAt,
    ),
    approvedBriefRevision: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedBriefRevision,
    ),
    approvedPersistedRevision: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES.approvedPersistedRevision,
    ),
    approvedRequirementsFingerprint: idFor(
      AGENT_BRIEF_LIFECYCLE_FIELD_NAMES
        .approvedRequirementsFingerprint,
    ),
  };
}

function findFixtureIssue(
  issues: readonly RedmineIssueSummary[],
): RedmineIssueSummary {
  const issue = issues.find(
    ({ subject }) => subject === FIXTURE_SUBJECT,
  );

  if (issue === undefined) {
    throw new Error("Agent Brief E2E fixture Issue was not found");
  }

  return issue;
}

describe("explicit Agent Brief approval MCP entry point", () => {
  it("publishes one guarded write Tool and delegates a valid approval end to end", async () => {
    const { redmineUrl, writerApiKey } =
      getRedmineWriterTestEnvironment();
    const writerClient = createWriterTestClient();
    const issues = await writerClient.listIssues({
      projectId: PROJECT_IDENTIFIER,
      subject: FIXTURE_SUBJECT,
      limit: 10,
    });
    const targetIssue = findFixtureIssue(issues.items);
    const initialIssue = await writerClient.getIssue(targetIssue.id);
    const fieldIds = requireLifecycleFieldIds(initialIssue);
    const lifecycleWriter = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: redmineUrl,
      apiKey: writerApiKey,
    });
    const lifecycleBoundary = new AgentBriefLifecycleMetadataBoundary(
      writerClient,
      lifecycleWriter,
      new WriteGuard({
        writeEnabled: true,
        allowedProjects: [PROJECT_IDENTIFIER],
      }),
    );
    const repositoryRoot = createRepository();
    let harness: Awaited<ReturnType<typeof createMcpE2eHarness>> | undefined;

    const resetIssue = async (): Promise<void> => {
      await lifecycleWriter.updateAgentBriefLifecycleFields(
        targetIssue.id,
        fieldIds,
        {
          lifecycle: "Brief Draft",
          approvedBy: "",
          approvedAt: "",
          approvedBriefRevision: "",
          approvedPersistedRevision: "",
          approvedRequirementsFingerprint: "",
        },
      );
    };

    try {
      await resetIssue();
      await lifecycleBoundary.transition(targetIssue.id, {
        targetLifecycle: "Brief Ready",
      });

      const latestIssue = await writerClient.getIssue(
        targetIssue.id,
        {
          include: ["journals", "relations", "children"],
        },
      );
      const fingerprint =
        calculateAgentBriefRequirementsFingerprint(
          projectAgentBriefGenerationInput(latestIssue),
        );
      const persistedRevision = writeBriefRevision(
        repositoryRoot,
        targetIssue.id,
        briefMarkdown(targetIssue.id, fingerprint),
      );

      harness = await createMcpE2eHarness({
        clientName: "redmine-agent-brief-approval-e2e-client",
        env: {
          REDMINE_API_KEY: writerApiKey,
          REDMINE_WRITE_ENABLED: "true",
          REDMINE_ALLOWED_PROJECTS: PROJECT_IDENTIFIER,
          AGENT_BRIEF_REPOSITORY_ROOT: repositoryRoot,
          AGENT_BRIEF_REPOSITORY: REPOSITORY,
          AGENT_BRIEF_CANONICAL_BRANCH: "main",
          AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS: "",
        },
      });

      const tool = await harness.getTool(
        "redmine_approve_agent_brief",
      );
      expect(tool).toBeDefined();
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });

      const invalidReference = await harness.callTool(
        "redmine_approve_agent_brief",
        {
          issue_id: targetIssue.id,
          brief_revision: BRIEF_REVISION,
          persisted_revision: "not-the-reviewed-object",
        },
      );
      expect(invalidReference.isError).toBe(false);
      expect(invalidReference.structuredContent).toMatchObject({
        outcome: "validation_failed",
        reason: "reviewed_reference_invalid",
        handoff_eligible: false,
      });
      expect(
        (await lifecycleBoundary.read(targetIssue.id)).lifecycle,
      ).toBe("Brief Ready");

      const result = await harness.callTool(
        "redmine_approve_agent_brief",
        {
          issue_id: targetIssue.id,
          brief_revision: BRIEF_REVISION,
          persisted_revision: persistedRevision,
        },
      );
      const responseText = requireTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        outcome: "approved",
        issue_id: targetIssue.id,
        brief_revision: BRIEF_REVISION,
        persisted_revision: persistedRevision,
        requirements_fingerprint: fingerprint,
        lifecycle: "Ready for Agent",
        handoff_eligible: true,
      });
      expect(JSON.parse(responseText) as unknown).toEqual(
        result.structuredContent,
      );
      expect(responseText).not.toContain(writerApiKey);

      const approved = await lifecycleBoundary.read(targetIssue.id);
      expect(approved.lifecycle).toBe("Ready for Agent");
      expect(approved.handoffEligible).toBe(true);
      expect(
        approved.approvalMetadata.approvedBriefRevision,
      ).toBe(BRIEF_REVISION);
      expect(
        approved.approvalMetadata.approvedPersistedRevision,
      ).toBe(persistedRevision);
      expect(
        approved.approvalMetadata.approvedRequirementsFingerprint,
      ).toBe(fingerprint);
    } finally {
      if (harness !== undefined) {
        await harness.close().catch(() => undefined);
      }
      await resetIssue().catch(() => undefined);
      rmSync(repositoryRoot, {
        recursive: true,
        force: true,
      });
    }
  }, 15_000);
});
