import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type {
  AgentBriefApprovalHandlerResult,
  AgentBriefApprovalRequest,
} from "../../agent-brief/approval-handler.js";
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
  ): Promise<AgentBriefApprovalHandlerResult>;
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
        "reference. The Redmine Issue must already be in Brief Ready. " +
        "The Handler validates the requested Brief revision and persisted " +
        "revision against current Redmine requirements. CURRENT may record " +
        "approval metadata and move the lifecycle to Ready for Agent; STALE " +
        "moves it back to Brief Draft. This tool does not execute an Agent.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: approveAgentBriefInputSchema,
      outputSchema: agentBriefApprovalOutputSchema,
    },
    (input) => callApproveAgentBriefTool(approvalHandler, input),
  );
}
