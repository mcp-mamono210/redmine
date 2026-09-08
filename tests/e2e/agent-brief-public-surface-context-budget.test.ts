import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  callApproveAgentBriefTool,
  type AgentBriefApprovalToolHandler,
} from "../../src/mcp/tools/agent-brief-approval.js";
import {
  measureContext,
  measureContextWorkflow,
  measureSerializedValue,
  type ContextSize,
} from "../helpers/context-measurement.js";
import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

const APPROVAL_TOOL_NAME = "redmine_approve_agent_brief";
const REPOSITORY = "mcp-mamono210/redmine";
const PROJECT_IDENTIFIER = "mcp-agent-brief";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const PERSISTED_REVISION = "0123456789abcdef0123456789abcdef01234567";

const BUDGET_PATH = resolve(
  "tests/e2e/agent-brief-public-surface-budget.json",
);

const BUDGET_SCENARIOS = [
  "agent_brief_write_tools_list_delta",
  "agent_brief_approval_tool_definition",
  "agent_brief_approval_output_schema",
  "agent_brief_approval_approved_response",
  "agent_brief_approval_public_workflow",
] as const;

type BudgetScenario = (typeof BUDGET_SCENARIOS)[number];

interface AgentBriefPublicSurfaceBudget {
  format_version: 1;
  token_estimate: {
    method: "utf8_bytes_divided_by_4_rounded_up";
    bytes_per_token: 4;
  };
  scenarios: Record<BudgetScenario, ContextSize>;
}

function isContextSize(value: unknown): value is ContextSize {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ContextSize>;
  return [
    candidate.bytes,
    candidate.characters,
    candidate.estimated_tokens,
  ].every(
    (metric) =>
      typeof metric === "number" &&
      Number.isInteger(metric) &&
      metric >= 0,
  );
}

function loadBudget(): AgentBriefPublicSurfaceBudget {
  const parsed = JSON.parse(
    readFileSync(BUDGET_PATH, "utf8"),
  ) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Agent Brief public-surface budget must be an object");
  }

  const candidate = parsed as {
    format_version?: unknown;
    token_estimate?: unknown;
    scenarios?: unknown;
  };

  if (candidate.format_version !== 1) {
    throw new Error("Unsupported Agent Brief public-surface budget version");
  }

  if (
    typeof candidate.token_estimate !== "object" ||
    candidate.token_estimate === null ||
    Array.isArray(candidate.token_estimate)
  ) {
    throw new Error("Agent Brief public-surface token estimate is invalid");
  }

  const tokenEstimate = candidate.token_estimate as {
    method?: unknown;
    bytes_per_token?: unknown;
  };

  if (
    tokenEstimate.method !== "utf8_bytes_divided_by_4_rounded_up" ||
    tokenEstimate.bytes_per_token !== 4
  ) {
    throw new Error("Agent Brief public-surface token estimate changed");
  }

  if (
    typeof candidate.scenarios !== "object" ||
    candidate.scenarios === null ||
    Array.isArray(candidate.scenarios)
  ) {
    throw new Error("Agent Brief public-surface scenarios are invalid");
  }

  const scenarios = candidate.scenarios as Record<string, unknown>;
  const scenarioNames = Object.keys(scenarios).sort();
  const expectedNames = [...BUDGET_SCENARIOS].sort();

  if (JSON.stringify(scenarioNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Agent Brief public-surface budget scenario set changed");
  }

  for (const scenario of BUDGET_SCENARIOS) {
    if (!isContextSize(scenarios[scenario])) {
      throw new Error(`Invalid Agent Brief public-surface budget: ${scenario}`);
    }
  }

  return parsed as AgentBriefPublicSurfaceBudget;
}

function subtractContextSize(
  total: ContextSize,
  base: ContextSize,
): ContextSize {
  return {
    bytes: total.bytes - base.bytes,
    characters: total.characters - base.characters,
    estimated_tokens: total.estimated_tokens - base.estimated_tokens,
  };
}

function assertWithinBudget(
  scenario: BudgetScenario,
  current: ContextSize,
  maximum: ContextSize,
): void {
  expect(
    current.bytes,
    `${scenario}.bytes exceeded ${maximum.bytes}`,
  ).toBeLessThanOrEqual(maximum.bytes);
  expect(
    current.characters,
    `${scenario}.characters exceeded ${maximum.characters}`,
  ).toBeLessThanOrEqual(maximum.characters);
  expect(
    current.estimated_tokens,
    `${scenario}.estimated_tokens exceeded ${maximum.estimated_tokens}`,
  ).toBeLessThanOrEqual(maximum.estimated_tokens);
}

function representativeApprovalHandler(): AgentBriefApprovalToolHandler {
  return {
    approve: () =>
      Promise.resolve({
        outcome: "approved",
        issueId: 5383,
        briefRevision: 1,
        persistedRevision: PERSISTED_REVISION,
        requirementsFingerprint: FINGERPRINT,
        lifecycle: "Ready for Agent",
        approverIdentity: "redmine-user:3",
        approvedAt: "2026-09-08T13:00:00Z",
        handoffEligible: true,
      }),
  };
}

describe("Agent Brief public MCP surface Context Budget", () => {
  it("measures the actual write-enabled surface and enforces reviewed budget ceilings", async () => {
    const budget = loadBudget();
    const readHarness = await createMcpE2eHarness({
      clientName: "redmine-agent-brief-context-read-client",
      env: {
        REDMINE_WRITE_ENABLED: "false",
        REDMINE_ALLOWED_PROJECTS: undefined,
        AGENT_BRIEF_REPOSITORY_ROOT: undefined,
        AGENT_BRIEF_REPOSITORY: undefined,
      },
    });
    let writeHarness:
      | Awaited<ReturnType<typeof createMcpE2eHarness>>
      | undefined;

    try {
      const readTools = await readHarness.listTools();
      writeHarness = await createMcpE2eHarness({
        clientName: "redmine-agent-brief-context-write-client",
        env: {
          REDMINE_WRITE_ENABLED: "true",
          REDMINE_ALLOWED_PROJECTS: PROJECT_IDENTIFIER,
          AGENT_BRIEF_REPOSITORY_ROOT: process.cwd(),
          AGENT_BRIEF_REPOSITORY: REPOSITORY,
          AGENT_BRIEF_CANONICAL_BRANCH: "main",
          AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS: "",
        },
      });
      const writeTools = await writeHarness.listTools();

      expect(
        readTools.tools.some(({ name }) => name === APPROVAL_TOOL_NAME),
      ).toBe(false);
      expect(
        writeTools.tools.filter(({ name }) => name === APPROVAL_TOOL_NAME),
      ).toHaveLength(1);
      expect(writeTools.tools.length - readTools.tools.length).toBe(1);

      const approvalTool = writeTools.tools.find(
        ({ name }) => name === APPROVAL_TOOL_NAME,
      );
      expect(approvalTool).toBeDefined();

      if (approvalTool === undefined) {
        throw new Error("Agent Brief approval Tool was not published");
      }

      expect(approvalTool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(approvalTool.inputSchema).toBeDefined();
      expect(approvalTool.outputSchema).toBeDefined();

      const readToolsSize = measureSerializedValue(readTools);
      const writeToolsSize = measureSerializedValue(writeTools);
      const toolsListDelta = subtractContextSize(
        writeToolsSize,
        readToolsSize,
      );

      expect(toolsListDelta.bytes).toBeGreaterThan(0);
      expect(toolsListDelta.characters).toBeGreaterThan(0);
      expect(toolsListDelta.estimated_tokens).toBeGreaterThan(0);

      const approvalToolSize = measureSerializedValue(approvalTool);
      const outputSchemaSize = measureSerializedValue(
        approvalTool.outputSchema,
      );
      const approvalResult = await callApproveAgentBriefTool(
        representativeApprovalHandler(),
        {
          issue_id: 5383,
          brief_revision: 1,
          persisted_revision: PERSISTED_REVISION,
        },
      );
      const approvalResultMeasurement = measureContext(
        "agent_brief_approval_approved_response",
        approvalResult,
        1,
      );
      const workflowMeasurement = measureContextWorkflow(
        "agent_brief_approval_public_workflow",
        [approvalTool, approvalResult],
      );

      expect(approvalResult.isError).toBe(false);
      if (!("structuredContent" in approvalResult)) {
        throw new Error("Expected approval structuredContent");
      }
      const approvalResponseText = requireTextContent(approvalResult.content);

      expect(approvalResult.structuredContent).toMatchObject({
        outcome: "approved",
        issue_id: 5383,
        brief_revision: 1,
        persisted_revision: PERSISTED_REVISION,
        requirements_fingerprint: FINGERPRINT,
        lifecycle: "Ready for Agent",
        handoff_eligible: true,
      });
      expect(JSON.parse(approvalResponseText) as unknown).toEqual(
        approvalResult.structuredContent,
      );

      assertWithinBudget(
        "agent_brief_write_tools_list_delta",
        toolsListDelta,
        budget.scenarios.agent_brief_write_tools_list_delta,
      );
      assertWithinBudget(
        "agent_brief_approval_tool_definition",
        approvalToolSize,
        budget.scenarios.agent_brief_approval_tool_definition,
      );
      assertWithinBudget(
        "agent_brief_approval_output_schema",
        outputSchemaSize,
        budget.scenarios.agent_brief_approval_output_schema,
      );
      assertWithinBudget(
        "agent_brief_approval_approved_response",
        approvalResultMeasurement.total,
        budget.scenarios.agent_brief_approval_approved_response,
      );
      assertWithinBudget(
        "agent_brief_approval_public_workflow",
        workflowMeasurement.total,
        budget.scenarios.agent_brief_approval_public_workflow,
      );
    } finally {
      if (writeHarness !== undefined) {
        await writeHarness.close().catch(() => undefined);
      }
      await readHarness.close().catch(() => undefined);
    }
  }, 20_000);
});
