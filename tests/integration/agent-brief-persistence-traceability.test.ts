import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  persistAgentBrief,
  readAgentBriefRevision,
  readCurrentAgentBrief,
  type AgentBriefPersistenceConfig,
} from "../../src/agent-brief/persistence.js";

const ISSUE_ID = 5363;
const REPOSITORY = "mcp-mamono210/redmine";
const temporaryRepositories: string[] = [];

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-persistence-traceability-"),
  );
  temporaryRepositories.push(repositoryRoot);

  git(repositoryRoot, ["init", "-b", "main"]);
  git(repositoryRoot, ["config", "user.name", "Agent Brief Traceability Test"]);
  git(repositoryRoot, [
    "config",
    "user.email",
    "agent-brief-traceability@example.invalid",
  ]);

  mkdirSync(join(repositoryRoot, "src"), { recursive: true });
  writeFileSync(join(repositoryRoot, "README.md"), "seed\n", "utf8");
  writeFileSync(
    join(repositoryRoot, "src", "runtime.ts"),
    "export const state = 'stable';\n",
    "utf8",
  );
  git(repositoryRoot, ["add", "README.md", "src/runtime.ts"]);
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

function brief(
  revision: number,
  goal = "Verify Phase 37 revision traceability and discovery.",
): string {
  return `---
format_version: 1
redmine_issue_id: ${ISSUE_ID}
repository: ${REPOSITORY}
brief_revision: ${revision}
requirements_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

## Agent Brief

### Goal

${goal}

### Context

Phase 37 must preserve an immutable, discoverable Brief revision history.

### In Scope

- Persist and discover exact Brief revisions.
- Re-read a historical revision after a newer revision exists.

### Out of Scope

- Redmine approval lifecycle.
- Agent execution.

### Requirements

- Keep historical revisions immutable.
- Keep approval and runtime state outside Brief storage.

### Architecture / Contract Constraints

- Use the Phase 35 Agent Brief contract.
- Use the Phase 37 repository-local persistence contract.

### Acceptance Criteria

- [ ] AC-1: The exact persisted revision remains retrievable.
- [ ] AC-2: Current and historical Brief revisions remain distinguishable.

### Verification

- AC-1: Re-read the pinned revision and verify the immutable Git object ID and bytes.
- AC-2: Persist a newer revision and verify current discovery changes without changing history.

### Deliverables

- Traceability and discovery verification evidence.

### Unresolved / Blocking

None.
`;
}

afterEach(() => {
  while (temporaryRepositories.length > 0) {
    const repositoryRoot = temporaryRepositories.pop();
    if (repositoryRoot !== undefined) {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  }
});

describe("Phase 37 Agent Brief traceability and discovery", () => {
  it("re-reads an exact pinned historical revision after current advances", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const firstMarkdown = brief(1);
    const first = await persistAgentBrief(config, firstMarkdown);

    const pinnedReference = {
      repository: first.repository,
      redmineIssueId: first.redmineIssueId,
      briefRevision: first.briefRevision,
      persistedRevision: first.persistedRevision,
    };

    const secondMarkdown = brief(
      2,
      "Verify that a later Brief does not replace the reviewed revision.",
    );
    const second = await persistAgentBrief(config, secondMarkdown);

    expect(second.persistedRevision).not.toBe(pinnedReference.persistedRevision);

    const current = await readCurrentAgentBrief(config, ISSUE_ID);
    expect(current).toMatchObject({
      repository: REPOSITORY,
      redmineIssueId: ISSUE_ID,
      briefRevision: 2,
      persistedRevision: second.persistedRevision,
      markdown: secondMarkdown,
    });

    const reviewed = await readAgentBriefRevision(
      config,
      pinnedReference.redmineIssueId,
      pinnedReference.briefRevision,
    );

    expect(reviewed).toMatchObject({
      repository: pinnedReference.repository,
      redmineIssueId: pinnedReference.redmineIssueId,
      briefRevision: pinnedReference.briefRevision,
      persistedRevision: pinnedReference.persistedRevision,
      markdown: firstMarkdown,
    });
    expect(
      git(repositoryRoot, ["cat-file", "-p", pinnedReference.persistedRevision]),
    ).toBe(firstMarkdown);
    expect(
      git(repositoryRoot, [
        "rev-parse",
        `main:docs/agent-briefs/${ISSUE_ID}/revisions/1.md`,
      ]).trim(),
    ).toBe(pinnedReference.persistedRevision);

    expect(Object.keys(reviewed).sort()).toEqual([
      "artifactPath",
      "briefRevision",
      "markdown",
      "persistedRevision",
      "redmineIssueId",
      "repository",
    ]);

    expect(
      git(repositoryRoot, [
        "ls-tree",
        "-r",
        "--name-only",
        "main",
        "--",
        `docs/agent-briefs/${ISSUE_ID}/revisions`,
      ])
        .trim()
        .split("\n"),
    ).toEqual([
      `docs/agent-briefs/${ISSUE_ID}/revisions/1.md`,
      `docs/agent-briefs/${ISSUE_ID}/revisions/2.md`,
    ]);
  });

  it("fails closed when current discovery encounters a noncanonical revision entry", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);

    await persistAgentBrief(config, brief(1));

    const revisionsDirectory = join(
      repositoryRoot,
      "docs",
      "agent-briefs",
      String(ISSUE_ID),
      "revisions",
    );
    writeFileSync(
      join(revisionsDirectory, "latest.md"),
      "noncanonical pointer\n",
      "utf8",
    );
    git(repositoryRoot, [
      "add",
      `docs/agent-briefs/${ISSUE_ID}/revisions/latest.md`,
    ]);
    git(repositoryRoot, ["commit", "-m", "inject noncanonical revision entry"]);

    await expect(
      readCurrentAgentBrief(config, ISSUE_ID),
    ).rejects.toMatchObject({ code: "stored_identity_mismatch" });
  });

  it("rejects approval or runtime metadata without creating Brief storage state", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const headBefore = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();

    const forbiddenEntries = [
      "approval_state: approved",
      "queue: pending",
      "claim: worker-1",
      "lease: active",
      "execution_state: running",
    ];

    for (const entry of forbiddenEntries) {
      const invalidBrief = brief(1).replace(
        "brief_revision: 1",
        `brief_revision: 1\n${entry}`,
      );

      await expect(
        persistAgentBrief(config, invalidBrief),
      ).rejects.toMatchObject({ code: "invalid_brief" });
    }

    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(
      headBefore,
    );
    expect(
      git(repositoryRoot, [
        "ls-tree",
        "-r",
        "--name-only",
        "main",
        "--",
        "docs/agent-briefs",
      ]).trim(),
    ).toBe("");
  });

  it("rejects conflicting content while preserving the original persisted object", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const originalMarkdown = brief(1);
    const original = await persistAgentBrief(config, originalMarkdown);
    const headAfterOriginal = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();

    await expect(
      persistAgentBrief(
        config,
        brief(1, "Conflicting content for the same revision identity."),
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });

    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(
      headAfterOriginal,
    );
    expect(
      git(repositoryRoot, ["cat-file", "-p", original.persistedRevision]),
    ).toBe(originalMarkdown);

    const historical = await readAgentBriefRevision(config, ISSUE_ID, 1);
    expect(historical.persistedRevision).toBe(original.persistedRevision);
    expect(historical.markdown).toBe(originalMarkdown);
  });
});
