import { describe, expect, it } from "vitest";

import {
  AgentBriefPersistenceError,
  agentBriefRevisionPath,
  resolveAgentBriefPersistenceIdentity,
} from "../../src/agent-brief/persistence.js";

const validBrief = `---
format_version: 1
redmine_issue_id: 5362
repository: mcp-mamono210/redmine
brief_revision: 1
requirements_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

## Agent Brief

### Goal

Persist one validated Brief revision.

### Context

Phase 37 requires immutable versioned Brief storage.

### In Scope

- Persist one Brief revision.

### Out of Scope

- Approval workflow.

### Requirements

- Keep revision identity deterministic.

### Architecture / Contract Constraints

- Keep runtime state outside the Brief.

### Acceptance Criteria

- [ ] AC-1: The Brief can be persisted with one canonical identity.

### Verification

- AC-1: Resolve the persistence identity from the validated Brief.

### Deliverables

- A versioned Brief artifact.

### Unresolved / Blocking

None.
`;

function capturePersistenceCode(
  operation: () => unknown,
): string | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    return error instanceof AgentBriefPersistenceError
      ? error.code
      : undefined;
  }
}

describe("Agent Brief persistence preflight", () => {
  it("derives the canonical repository-local revision path", () => {
    expect(agentBriefRevisionPath(5362, 7)).toBe(
      "docs/agent-briefs/5362/revisions/7.md",
    );

    expect(
      resolveAgentBriefPersistenceIdentity(
        validBrief,
        "mcp-mamono210/redmine",
      ),
    ).toEqual({
      repository: "mcp-mamono210/redmine",
      artifactPath: "docs/agent-briefs/5362/revisions/1.md",
      redmineIssueId: 5362,
      briefRevision: 1,
    });
  });

  it("rejects a Brief that does not satisfy the Phase 35 contract", () => {
    expect(
      capturePersistenceCode(() =>
        resolveAgentBriefPersistenceIdentity(
          validBrief.replace("format_version: 1", "format_version: 2"),
          "mcp-mamono210/redmine",
        ),
      ),
    ).toBe("invalid_brief");
  });

  it("fails closed for implementation_target storage", () => {
    const implementationTargetBrief = validBrief.replace(
      "repository: mcp-mamono210/redmine",
      "implementation_target: shared-agent-platform",
    );

    expect(
      capturePersistenceCode(() =>
        resolveAgentBriefPersistenceIdentity(
          implementationTargetBrief,
          "mcp-mamono210/redmine",
        ),
      ),
    ).toBe("unsupported_storage_target");
  });

  it("rejects a repository target mismatch", () => {
    expect(
      capturePersistenceCode(() =>
        resolveAgentBriefPersistenceIdentity(
          validBrief,
          "mcp-mamono210/other-repository",
        ),
      ),
    ).toBe("storage_target_mismatch");
  });
});
