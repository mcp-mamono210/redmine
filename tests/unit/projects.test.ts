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
  status: 1,
  isPublic: false,
  parent: { id: 10, name: "Parent Project" },
  createdOn: "2026-08-01T00:00:00Z",
  updatedOn: "2026-08-23T00:00:00Z",
  trackers: [{ id: 1, name: "Bug" }],
  issueCategories: [],
  issueCustomFields: [
    {
      id: 5,
      name: "release_tag",
      fieldFormat: "string",
      isRequired: false,
    },
  ],
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
  it("returns get_project as a stable snake_case envelope", async () => {
    const client: ProjectToolClient = {
      getProject: () => Promise.resolve(project),
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callGetProjectTool(client, {
      project_id: "mcp-test",
    });

    expect(result.isError).toBe(false);

    expect(JSON.parse(requireText(result)) as unknown).toEqual({
      project: {
        id: 1,
        identifier: "mcp-test",
        name: "MCP Test Project",
        description: "Representative MCP test project",
        status: 1,
        is_public: false,
        parent: { id: 10, name: "Parent Project" },
        created_on: "2026-08-01T00:00:00Z",
        updated_on: "2026-08-23T00:00:00Z",
      },
      trackers: [{ id: 1, name: "Bug" }],
      categories: [],
      custom_fields: [
        {
          id: 5,
          name: "release_tag",
          field_format: "string",
          is_required: false,
        },
      ],
      versions: null,
      members: null,
      priorities: null,
      warnings: [],
    });
  });

  it("uses empty arrays for requested metadata with zero results", async () => {
    const client: ProjectToolClient = {
      getProject: () =>
        Promise.resolve({
          id: 1,
          name: "MCP Test Project",
          identifier: "mcp-test",
        }),
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callGetProjectTool(client, {
      project_id: "mcp-test",
    });

    const envelope = JSON.parse(requireText(result)) as {
      trackers: unknown[];
      categories: unknown[];
      custom_fields: unknown[];
      versions: null;
      members: null;
      priorities: null;
      warnings: unknown[];
    };

    expect(envelope.trackers).toEqual([]);
    expect(envelope.categories).toEqual([]);
    expect(envelope.custom_fields).toEqual([]);
    expect(envelope.versions).toBeNull();
    expect(envelope.members).toBeNull();
    expect(envelope.priorities).toBeNull();
    expect(envelope.warnings).toEqual([]);
  });

  it("keeps list_projects summarized", async () => {
    const client: ProjectToolClient = {
      getProject: () => Promise.resolve(project),
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callListProjectsTool(client, {});
    const listed = JSON.parse(requireText(result)) as {
      items: Array<Record<string, unknown>>;
    };

    expect(listed.items[0]).not.toHaveProperty("description");
    expect(listed.items[0]).not.toHaveProperty("trackers");
    expect(listed.items[0]).not.toHaveProperty("issueCategories");
    expect(listed.items[0]).not.toHaveProperty("issueCustomFields");
  });
});
