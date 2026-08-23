import { describe, expect, it } from "vitest";

import {
  callGetProjectTool,
  callListProjectsTool,
  type ProjectToolClient,
} from "../../src/mcp/tools/projects.js";
import type {
  RedminePaginatedResponse,
  RedmineProject,
  RedmineProjectSummary,
} from "../../src/redmine/types.js";

const project: RedmineProject = {
  id: 1,
  name: "MCP Test Project",
  identifier: "mcp-test",
  description: "Representative MCP test project",
  trackers: [{ id: 1, name: "Bug" }],
  issueCategories: [],
  issueCustomFields: [],
};

const projectPage: RedminePaginatedResponse<RedmineProjectSummary> = {
  items: [
    {
      id: 1,
      name: "MCP Test Project",
      identifier: "mcp-test",
    },
  ],
  totalCount: 1,
  offset: 0,
  limit: 25,
};

function requireText(result: {
  content: Array<{ type: "text"; text: string }>;
}): string {
  const content = result.content[0];

  if (!content || content.type !== "text") {
    throw new Error("Expected text content");
  }

  return content.text;
}

describe("Project read-only tools", () => {
  it("keeps get_project detailed while list_projects stays summarized", async () => {
    const client: ProjectToolClient = {
      getProject: () => Promise.resolve(project),
      listProjects: () => Promise.resolve(projectPage),
    };

    const getResult = await callGetProjectTool(client, { project_id: "mcp-test" });
    const listResult = await callListProjectsTool(client, {});

    const detailed = JSON.parse(requireText(getResult)) as Record<string, unknown>;
    const listed = JSON.parse(requireText(listResult)) as {
      items: Array<Record<string, unknown>>;
    };

    expect(detailed).toHaveProperty("description");
    expect(detailed).toHaveProperty("trackers");
    expect(listed.items[0]).not.toHaveProperty("description");
    expect(listed.items[0]).not.toHaveProperty("trackers");
    expect(listed.items[0]).not.toHaveProperty("issueCategories");
    expect(listed.items[0]).not.toHaveProperty("issueCustomFields");
  });
});
