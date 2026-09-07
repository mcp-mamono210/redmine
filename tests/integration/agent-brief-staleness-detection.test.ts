import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  projectAgentBriefGenerationInput,
} from "../../src/agent-brief/generation-input.js";
import {
  persistAgentBrief,
  readCurrentAgentBrief,
  type AgentBriefPersistenceConfig,
} from "../../src/agent-brief/persistence.js";
import {
  calculateAgentBriefRequirementsFingerprint,
} from "../../src/agent-brief/requirements-fingerprint.js";
import {
  detectAgentBriefRequirementsStaleness,
} from "../../src/agent-brief/staleness-detection.js";
import type { RedmineIssue } from "../../src/redmine/types.js";

const temporaryRepositories: string[] = [];

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function createRepository(): string {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), "agent-brief-staleness-"),
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
    repository: "mcp-mamono210/redmine",
    canonicalBranch: "main",
  };
}

function issueFixture(): RedmineIssue {
  return {
    id: 5369,
    project: {
      id: 414,
      name: "Redmine",
    },
    tracker: {
      id: 2,
      name: "Feature",
    },
    status: {
      id: 1,
      name: "New",
    },
    priority: {
      id: 2,
      name: "Normal",
    },
    author: {
      id: 10,
      name: "Chat GPT",
    },
    assignedTo: {
      id: 3,
      name: "mamono 210",
    },
    fixedVersion: {
      id: 29,
      name: "0.3.0",
    },
    subject: "Requirements staleness detection",
    description: "Compare persisted Brief requirements with current requirements.",
    customFields: [
      {
        id: 21,
        name: "Requirement",
        value: "Preserve deterministic comparison semantics.",
      },
      {
        id: 90,
        name: "Brief Approved By",
        value: "redmine-user:3",
      },
      {
        id: 91,
        name: "Agent Brief Lifecycle",
        value: "Brief Ready",
      },
    ],
    updatedOn: "2026-09-07T00:00:00Z",
  };
}

function briefMarkdown(fingerprint: string): string {
  return `---
format_version: 1
redmine_issue_id: 5369
repository: mcp-mamono210/redmine
brief_revision: 1
requirements_fingerprint: ${fingerprint}
---

## Agent Brief

### Goal

Detect stale requirements before approval orchestration.

### Context

Phase 39-3 compares a persisted Brief fingerprint with current requirements.

### In Scope

- Read the persisted fingerprint.
- Compare it with the current deterministic fingerprint.

### Out of Scope

- Redmine lifecycle mutation.
- Approval metadata writes.

### Requirements

- Equal fingerprints produce CURRENT.
- Different fingerprints produce STALE.

### Architecture / Contract Constraints

- Reuse Phase 36 projection and Phase 39-2 fingerprint generation.
- Keep lifecycle mutation in Phase 40.

### Acceptance Criteria

- [ ] AC-1: Persisted and current requirements can be compared deterministically.

### Verification

- AC-1: Persist a Brief, read it through Phase 37, and evaluate Phase 39-3.

### Deliverables

- The Phase 39-3 comparison result.

### Unresolved / Blocking

None.
`;
}

function project(issue: RedmineIssue) {
  return projectAgentBriefGenerationInput(issue, {
    requirementCustomFieldIds: [21],
  });
}

afterEach(() => {
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

describe("Agent Brief staleness detection integration", () => {
  it("connects Phase 36, 37, 39-2, and 39-3 without lifecycle mutation", async () => {
    const repositoryRoot = createRepository();
    const config = persistenceConfig(repositoryRoot);
    const originalIssue = issueFixture();
    const generationInput = project(originalIssue);
    const fingerprint =
      calculateAgentBriefRequirementsFingerprint(generationInput);

    await persistAgentBrief(
      config,
      briefMarkdown(fingerprint),
    );

    const persisted = await readCurrentAgentBrief(config, 5369);
    const headBeforeDetection = git(
      repositoryRoot,
      ["rev-parse", "HEAD"],
    ).trim();

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        project(structuredClone(originalIssue)),
      ).kind,
    ).toBe("CURRENT");

    const workflowOnlyChange = structuredClone(originalIssue);
    workflowOnlyChange.status = {
      id: 2,
      name: "In Progress",
    };
    workflowOnlyChange.assignedTo = {
      id: 99,
      name: "Another User",
    };
    workflowOnlyChange.updatedOn = "2026-09-08T00:00:00Z";
    for (const field of workflowOnlyChange.customFields) {
      if (field.id === 90) {
        field.value = "redmine-user:99";
      }
      if (field.id === 91) {
        field.value = "Ready for Agent";
      }
    }

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        project(workflowOnlyChange),
      ).kind,
    ).toBe("CURRENT");

    const requirementChange = structuredClone(originalIssue);
    requirementChange.description =
      "The implementation requirement changed after Brief persistence.";

    expect(
      detectAgentBriefRequirementsStaleness(
        persisted,
        project(requirementChange),
      ).kind,
    ).toBe("STALE");

    expect(
      git(repositoryRoot, ["rev-parse", "HEAD"]).trim(),
    ).toBe(headBeforeDetection);
  });
});
