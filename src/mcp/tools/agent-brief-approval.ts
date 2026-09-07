import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AgentBriefApprovalRequest } from "../../agent-brief/approval-handler.js";
import type { AgentBriefApprovalIdempotentResult } from "../../agent-brief/approval-idempotency.js";
import { toToolErrorResult } from "../errors.js";
import { agentBriefApprovalOutputSchema } from "../output-schemas.js";
import { createPublicMcpSuccessResult } from "../serialize.js";

export const approveAgentBriefInputSchema = z.object({
  issue_id: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  brief_revision: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  persisted_revision: z.string().refine(
    (value) => value.trim() !== "",
    "persisted_revision must not be blank",
  ),
});

export type ApproveAgentBriefInput = z.infer<
  typeof approveAgentBriefInputSchema
>;

export interface AgentBriefApprovalToolHandler {
  approve(
    request: AgentBriefApprovalRequest,
  ): Promise<AgentBriefApprovalIdempotentResult>;
}

export async function callApproveAgentBriefTool(
  approvalHandler: AgentBriefApprovalToolHandler,
  input: ApproveAgentBriefInput,
) {
  try {
    const result = await approvalHandler.approve({
      issueId: input.issue_id,
      briefRevision: input.brief_revision,
      persistedRevision: input.persisted_revision,
    });

    return createPublicMcpSuccessResult(result);
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export function registerApproveAgentBriefTool(
  server: McpServer,
  approvalHandler: AgentBriefApprovalToolHandler,
): void {
  server.registerTool(
    "redmine_approve_agent_brief",
    {
      description:
        "Explicitly validate one human-reviewed immutable Agent Brief " +
        "reference. A new approval requires the Redmine Issue to be in Brief Ready; " +
        "an exact completed approval may be reconciled idempotently. " +
        "The Handler validates the requested Brief revision and persisted " +
        "revision against current Redmine requirements. CURRENT may record " +
        "approval metadata and move the lifecycle to Ready for Agent; STALE " +
        "moves it back to Brief Draft. Duplicate and ambiguous write attempts " +
        "are reconciled with bounded recovery. This tool does not execute an Agent.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: approveAgentBriefInputSchema,
      outputSchema: agentBriefApprovalOutputSchema,
    },
    (input) => callApproveAgentBriefTool(approvalHandler, input),
  );
}
