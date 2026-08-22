import { describe, expect, it } from "vitest";

import {
  callGetProjectTool,
  callListProjectsTool,
  getProjectInputSchema,
  listProjectsInputSchema,
  type ProjectToolClient,
} from "../../src/mcp/tools/projects.js";
import { RedmineHttpError } from "../../src/redmine/errors.js";
import type {
  RedmineListProjectsParams,
  RedminePaginatedResponse,
  RedmineProject,
  RedmineProjectSummary,
} from "../../src/redmine/types.js";

const apiKey = "0123456789abcdef0123456789abcdef01234567";

const project: RedmineProject = {
  id: 1,
  name: "MCP Test Project",
  identifier: "mcp-test",
  description: "Representative MCP test project",
  trackers: [
    { id: 1, name: "Bug" },
    { id: 2, name: "Feature" },
    { id: 3, name: "Task" },
  ],
  issueCategories: [],
  issueCustomFields: [
    {
      id: 1,
      name: "release_tag",
      fieldFormat: "string",
      isRequired: false,
    },
  ],
};

const projectPage: RedminePaginatedResponse<RedmineProjectSummary> = {
  items: [
    {
      id: project.id,
      name: project.name,
      identifier: project.identifier,
      description: project.description,
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
  it("gets a project by identifier with project metadata included", async () => {
    let receivedProjectId: string | number | undefined;
    let receivedIncludes: readonly string[] | undefined;

    const client: ProjectToolClient = {
      getProject: (projectId, options) => {
        receivedProjectId = projectId;
        receivedIncludes = options?.include;
        return Promise.resolve(project);
      },
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callGetProjectTool(client, {
      project_id: "mcp-test",
    });

    expect(result.isError).toBe(false);
    expect(receivedProjectId).toBe("mcp-test");
    expect(receivedIncludes).toEqual([
      "trackers",
      "issue_categories",
      "issue_custom_fields",
    ]);
    expect(JSON.parse(requireText(result)) as unknown).toEqual(project);
  });

  it("gets a project by numeric ID", async () => {
    let receivedProjectId: string | number | undefined;

    const client: ProjectToolClient = {
      getProject: (projectId) => {
        receivedProjectId = projectId;
        return Promise.resolve(project);
      },
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callGetProjectTool(client, {
      project_id: 1,
    });

    expect(result.isError).toBe(false);
    expect(receivedProjectId).toBe(1);
  });

  it("maps a missing project through the shared error model", async () => {
    const client: ProjectToolClient = {
      getProject: () =>
        Promise.reject(
          new RedmineHttpError({
            method: "GET",
            path: "/projects/missing-project.json",
            status: 404,
            statusText: "Not Found",
            errors: [`secret ${apiKey}`],
          }),
        ),
      listProjects: () => Promise.resolve(projectPage),
    };

    const result = await callGetProjectTool(client, {
      project_id: "missing-project",
    });
    const text = requireText(result);

    expect(result.isError).toBe(true);
    expect(text).toContain('"code":"not_found"');
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain("secret");
  });

  it("forwards project pagination to RedmineClient", async () => {
    let receivedParams: RedmineListProjectsParams | undefined;

    const client: ProjectToolClient = {
      getProject: () => Promise.resolve(project),
      listProjects: (params) => {
        receivedParams = params;
        return Promise.resolve(projectPage);
      },
    };

    const result = await callListProjectsTool(client, {
      offset: 10,
      limit: 25,
    });

    expect(result.isError).toBe(false);
    expect(receivedParams).toEqual({
      offset: 10,
      limit: 25,
    });
    expect(JSON.parse(requireText(result)) as unknown).toEqual(projectPage);
  });

  it("accepts an empty project list input", () => {
    expect(listProjectsInputSchema.safeParse({}).success).toBe(true);
  });

  it("validates project IDs and identifiers", () => {
    expect(
      getProjectInputSchema.safeParse({ project_id: "mcp-test" }).success,
    ).toBe(true);
    expect(
      getProjectInputSchema.safeParse({ project_id: 1 }).success,
    ).toBe(true);
    expect(
      getProjectInputSchema.safeParse({ project_id: "" }).success,
    ).toBe(false);
    expect(
      getProjectInputSchema.safeParse({ project_id: 0 }).success,
    ).toBe(false);
    expect(
      getProjectInputSchema.safeParse({ project_id: -1 }).success,
    ).toBe(false);
  });

  it("rejects invalid project pagination values", () => {
    expect(
      listProjectsInputSchema.safeParse({ offset: -1 }).success,
    ).toBe(false);
    expect(
      listProjectsInputSchema.safeParse({ limit: 0 }).success,
    ).toBe(false);
    expect(
      listProjectsInputSchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });
});
