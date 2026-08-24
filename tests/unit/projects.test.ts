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

function createClient(
  overrides: Partial<ProjectToolClient> = {},
): ProjectToolClient {
  return {
    getProject: () => Promise.resolve(project),
    listProjects: () => Promise.resolve(projectPage),
    listProjectVersions: () =>
      Promise.resolve([
        {
          id: 3,
          project: { id: 1, name: "MCP Test Project" },
          name: "v0.2.0",
          status: "open",
          dueDate: "2026-09-01",
          sharing: "none",
        },
      ]),
    listProjectMemberships: () =>
      Promise.resolve({
        items: [
          {
            id: 7,
            project: { id: 1, name: "MCP Test Project" },
            user: { id: 2, name: "MCP Test User" },
            roles: [{ id: 4, name: "MCP Read Only" }],
          },
        ],
        totalCount: 1,
        offset: 0,
        limit: 100,
      }),
    listIssuePriorities: () =>
      Promise.resolve([
        { id: 1, name: "Low" },
        { id: 2, name: "Normal" },
      ]),
    ...overrides,
  };
}

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
  it("aggregates project metadata into the stable snake_case envelope", async () => {
    const result = await callGetProjectTool(createClient(), {
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
      versions: [
        {
          id: 3,
          name: "v0.2.0",
          status: "open",
          due_date: "2026-09-01",
          sharing: "none",
        },
      ],
      members: [
        {
          id: 7,
          user: { id: 2, name: "MCP Test User" },
          roles: [{ id: 4, name: "MCP Read Only" }],
        },
      ],
      priorities: [
        { id: 1, name: "Low" },
        { id: 2, name: "Normal" },
      ],
      warnings: [],
    });
  });

  it("uses empty arrays when optional metadata requests succeed with zero results", async () => {
    const result = await callGetProjectTool(
      createClient({
        listProjectVersions: () => Promise.resolve([]),
        listProjectMemberships: () =>
          Promise.resolve({
            items: [],
            totalCount: 0,
            offset: 0,
            limit: 100,
          }),
        listIssuePriorities: () => Promise.resolve([]),
      }),
      { project_id: "mcp-test" },
    );

    const envelope = JSON.parse(requireText(result)) as {
      versions: unknown[];
      members: unknown[];
      priorities: unknown[];
      warnings: unknown[];
    };

    expect(envelope.versions).toEqual([]);
    expect(envelope.members).toEqual([]);
    expect(envelope.priorities).toEqual([]);
    expect(envelope.warnings).toEqual([]);
  });

  it("keeps optional metadata failures partial and records warnings", async () => {
    const result = await callGetProjectTool(
      createClient({
        listProjectVersions: () => Promise.reject(new Error("boom")),
        listProjectMemberships: () => Promise.reject(new Error("boom")),
        listIssuePriorities: () => Promise.reject(new Error("boom")),
      }),
      { project_id: "mcp-test" },
    );

    expect(result.isError).toBe(false);

    const envelope = JSON.parse(requireText(result)) as {
      versions: null;
      members: null;
      priorities: null;
      warnings: string[];
    };

    expect(envelope.versions).toBeNull();
    expect(envelope.members).toBeNull();
    expect(envelope.priorities).toBeNull();
    expect(envelope.warnings).toEqual([
      "versions: unavailable",
      "members: unavailable",
      "priorities: unavailable",
    ]);
  });

  it("warns when memberships exceed the bounded aggregation page", async () => {
    const result = await callGetProjectTool(
      createClient({
        listProjectMemberships: () =>
          Promise.resolve({
            items: [
              {
                id: 7,
                project: { id: 1, name: "MCP Test Project" },
                user: { id: 2, name: "MCP Test User" },
                roles: [{ id: 4, name: "MCP Read Only" }],
              },
            ],
            totalCount: 101,
            offset: 0,
            limit: 100,
          }),
      }),
      { project_id: "mcp-test" },
    );

    const envelope = JSON.parse(requireText(result)) as {
      warnings: string[];
    };

    expect(envelope.warnings).toContain(
      "members: truncated to 1 of 101",
    );
  });

  it("fails the tool when the project itself cannot be retrieved", async () => {
    const result = await callGetProjectTool(
      createClient({
        getProject: () => Promise.reject(new Error("project failed")),
      }),
      { project_id: "mcp-test" },
    );

    expect(result.isError).toBe(true);
  });

  it("keeps list_projects summarized", async () => {
    const result = await callListProjectsTool(createClient(), {});
    const listed = JSON.parse(requireText(result)) as {
      items: Array<Record<string, unknown>>;
    };

    expect(listed.items[0]).not.toHaveProperty("description");
    expect(listed.items[0]).not.toHaveProperty("trackers");
    expect(listed.items[0]).not.toHaveProperty("issue_categories");
    expect(listed.items[0]).not.toHaveProperty("custom_fields");
  });
});
