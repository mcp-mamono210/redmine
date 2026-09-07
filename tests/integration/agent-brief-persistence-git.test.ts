import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

const temporaryRepositories: string[] = [];

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-persistence-git-"),
  );
  temporaryRepositories.push(repositoryRoot);

  git(repositoryRoot, ["init", "-b", "main"]);
  git(repositoryRoot, ["config", "user.name", "Agent Brief Test"]);
  git(repositoryRoot, [
    "config",
    "user.email",
    "agent-brief-test@example.invalid",
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
    repository: "mcp-mamono210/redmine",
    canonicalBranch: "main",
  };
}

function brief(
  revision: number,
  goal = "Persist one validated Brief revision.",
): string {
  return `---
format_version: 1
redmine_issue_id: 5362
repository: mcp-mamono210/redmine
brief_revision: ${revision}
requirements_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

## Agent Brief

### Goal

${goal}

### Context

Phase 37 requires immutable versioned Brief storage.

### In Scope

- Persist and retrieve the requested Brief revision.

### Out of Scope

- Approval workflow.
- Agent execution.

### Requirements

- Preserve historical revisions.
- Reject conflicting content for an existing revision identity.

### Architecture / Contract Constraints

- Store only validated Agent Brief content.
- Keep runtime state outside Brief storage.

### Acceptance Criteria

- [ ] AC-1: The requested revision is persisted immutably.
- [ ] AC-2: Historical revisions remain retrievable.

### Verification

- AC-1: Read the exact persisted Git object for this revision.
- AC-2: Read revision 1 after revision 2 has been persisted.

### Deliverables

- The persisted Agent Brief revision.
- Its immutable persisted revision identifier.

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

describe("Agent Brief Git persistence", () => {
  it("persists immutable revisions without committing unrelated source changes", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const seedCommit = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();

    writeFileSync(
      join(repositoryRoot, "src", "runtime.ts"),
      "export const state = 'dirty';\n",
      "utf8",
    );
    git(repositoryRoot, ["add", "src/runtime.ts"]);

    const firstMarkdown = brief(1);
    const first = await persistAgentBrief(config, firstMarkdown);

    expect(first).toMatchObject({
      repository: "mcp-mamono210/redmine",
      artifactPath: "docs/agent-briefs/5362/revisions/1.md",
      redmineIssueId: 5362,
      briefRevision: 1,
      markdown: firstMarkdown,
    });
    expect(first.persistedRevision).toBe(
      git(repositoryRoot, [
        "rev-parse",
        "main:docs/agent-briefs/5362/revisions/1.md",
      ]).trim(),
    );
    expect(
      git(repositoryRoot, ["show", "HEAD:src/runtime.ts"]),
    ).toBe("export const state = 'stable';\n");
    expect(
      readFileSync(join(repositoryRoot, "src", "runtime.ts"), "utf8"),
    ).toBe("export const state = 'dirty';\n");
    expect(
      git(repositoryRoot, ["diff", "--cached", "--name-only"]).trim(),
    ).toBe("src/runtime.ts");
    expect(
      git(repositoryRoot, [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "HEAD",
      ]).trim(),
    ).toBe("docs/agent-briefs/5362/revisions/1.md");
    expect(
      git(repositoryRoot, ["rev-parse", "HEAD^"]).trim(),
    ).toBe(seedCommit);

    const headAfterFirst = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();
    const repeated = await persistAgentBrief(config, firstMarkdown);
    expect(repeated.persistedRevision).toBe(first.persistedRevision);
    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(
      headAfterFirst,
    );

    await expect(
      persistAgentBrief(
        config,
        brief(1, "Conflicting content for the same revision."),
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });

    await expect(
      persistAgentBrief(config, brief(3)),
    ).rejects.toMatchObject({ code: "revision_gap" });

    const secondMarkdown = brief(2);
    const second = await persistAgentBrief(config, secondMarkdown);
    expect(second.briefRevision).toBe(2);

    const historical = await readAgentBriefRevision(config, 5362, 1);
    expect(historical.markdown).toBe(firstMarkdown);
    expect(historical.persistedRevision).toBe(first.persistedRevision);

    const current = await readCurrentAgentBrief(config, 5362);
    expect(current.briefRevision).toBe(2);
    expect(current.markdown).toBe(secondMarkdown);

    expect(
      git(repositoryRoot, ["show", "HEAD:src/runtime.ts"]),
    ).toBe("export const state = 'stable';\n");
    expect(
      readFileSync(join(repositoryRoot, "src", "runtime.ts"), "utf8"),
    ).toBe("export const state = 'dirty';\n");
  });

  it("rejects invalid Brief content without changing Git history", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const headBefore = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();
    const invalidBrief = brief(1).replace(
      "brief_revision: 1",
      "brief_revision: 1\nqueue: pending",
    );

    await expect(
      persistAgentBrief(config, invalidBrief),
    ).rejects.toMatchObject({ code: "invalid_brief" });

    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(
      headBefore,
    );
    expect(
      git(repositoryRoot, ["status", "--short"]).trim(),
    ).toBe("");
  });
});
