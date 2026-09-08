import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { McpServer } from "@modelcontextprotocol/server";

import { agentBriefApprovalOutputSchema } from "../../src/mcp/output-schemas.js";
import {
  getPublishedToolRegistry,
  toolRegistry,
} from "../../src/mcp/tool-registry.js";
import {
  approveAgentBriefInputSchema,
  registerApproveAgentBriefTool,
  type AgentBriefApprovalToolHandler,
} from "../../src/mcp/tools/agent-brief-approval.js";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };

function fakeHandler(): AgentBriefApprovalToolHandler {
  return {
    approve: () => Promise.reject(new Error("not invoked")),
  };
}

describe("Phase 42-3 Agent Brief final public MCP surface", () => {
  it("keeps one workflow-specific write Tool behind the write publication boundary", () => {
    expect(
      toolRegistry
        .filter((entry) => entry.access === "write")
        .map((entry) => entry.name),
    ).toEqual(["redmine_approve_agent_brief"]);

    expect(
      getPublishedToolRegistry(false).some(
        ({ name }) => name === "redmine_approve_agent_brief",
      ),
    ).toBe(false);
    expect(
      getPublishedToolRegistry(true).filter(
        ({ name }) => name === "redmine_approve_agent_brief",
      ),
    ).toHaveLength(1);
  });

  it("publishes the final Phase 41 annotations and canonical input/output schemas", () => {
    let registeredName: string | undefined;
    let registeredDefinition: unknown;
    const server = {
      registerTool: (name: string, definition: unknown) => {
        registeredName = name;
        registeredDefinition = definition;
      },
    } as unknown as McpServer;

    registerApproveAgentBriefTool(server, fakeHandler());

    expect(registeredName).toBe("redmine_approve_agent_brief");

    if (
      typeof registeredDefinition !== "object" ||
      registeredDefinition === null ||
      Array.isArray(registeredDefinition)
    ) {
      throw new Error("Expected Agent Brief Tool definition");
    }

    const definition = registeredDefinition as {
      annotations?: Record<string, unknown>;
      inputSchema?: unknown;
      outputSchema?: unknown;
    };

    expect(definition.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(definition.inputSchema).toBe(approveAgentBriefInputSchema);
    expect(definition.outputSchema).toBe(agentBriefApprovalOutputSchema);
  });

  it("keeps the reviewed-reference input and full final validation reason set", () => {
    expect(
      approveAgentBriefInputSchema.safeParse({
        issue_id: 5383,
        brief_revision: 1,
        persisted_revision: "persisted-revision",
      }).success,
    ).toBe(true);

    for (const reason of [
      "lifecycle_not_brief_ready",
      "reviewed_reference_invalid",
      "fingerprint_unavailable",
      "approval_conflict",
    ] as const) {
      expect(
        agentBriefApprovalOutputSchema.safeParse({
          outcome: "validation_failed",
          issue_id: 5383,
          brief_revision: 1,
          persisted_revision: "persisted-revision",
          reason,
          handoff_eligible: false,
        }).success,
      ).toBe(true);
    }
  });

  it("keeps the Agent Brief budget regression in the canonical Context Budget commands", () => {
    const scenarioPath =
      "tests/e2e/agent-brief-public-surface-context-budget.test.ts";

    expect(packageJson.scripts["context:measure:ci"]).toContain(scenarioPath);
    expect(packageJson.scripts["context:baseline:update"]).toContain(
      scenarioPath,
    );
  });

  it("keeps successful approved output bounded and schema-valid", () => {
    expect(
      agentBriefApprovalOutputSchema.safeParse({
        outcome: "approved",
        issue_id: 5383,
        brief_revision: 1,
        persisted_revision: "persisted-revision",
        requirements_fingerprint: FINGERPRINT,
        lifecycle: "Ready for Agent",
        approver_identity: "redmine-user:3",
        approved_at: "2026-09-08T13:00:00Z",
        handoff_eligible: true,
      }).success,
    ).toBe(true);
  });
});
