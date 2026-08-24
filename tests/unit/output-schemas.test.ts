import { describe, expect, it } from "vitest";

import {
  currentUserOutputSchema,
  getIssueOutputSchema,
  getProjectOutputSchema,
  listIssuesOutputSchema,
  listProjectsOutputSchema,
  searchOutputSchema,
} from "../../src/mcp/output-schemas.js";

describe("public MCP output schemas", () => {
  it("accepts the current user public contract", () => {
    expect(
      currentUserOutputSchema.safeParse({
        id: 7,
        login: "mcp-test",
        firstname: "MCP",
        lastname: "Test",
        mail: "mcp-test@example.test",
      }).success,
    ).toBe(true);
  });

  it("accepts issue detail with optional associations", () => {
    expect(
      getIssueOutputSchema.safeParse({
        id: 101,
        project: { id: 1, name: "MCP Test Project" },
        tracker: { id: 1, name: "Bug" },
        status: { id: 1, name: "New", is_closed: false },
        priority: { id: 2, name: "Normal" },
        author: { id: 2, name: "MCP Test User" },
        assigned_to: { id: 2, name: "MCP Test User" },
        subject: "Authentication fails for invalid API token",
        description: "Representative issue",
        custom_fields: [
          {
            id: 5,
            name: "release_tag",
            value: "v0.2.0",
          },
        ],
        allowed_statuses: [
          { id: 1, name: "New" },
          { id: 2, name: "In Progress" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts summarized issue pagination", () => {
    expect(
      listIssuesOutputSchema.safeParse({
        items: [
          {
            id: 101,
            subject: "Authentication fails for invalid API token",
            project: { id: 1, name: "MCP Test Project" },
            tracker: { id: 1, name: "Bug" },
            status: { id: 1, name: "New" },
            priority: { id: 2, name: "Normal" },
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 10,
      }).success,
    ).toBe(true);
  });

  it("accepts get_project with populated metadata", () => {
    expect(
      getProjectOutputSchema.safeParse({
        project: {
          id: 1,
          identifier: "mcp-test",
          name: "MCP Test Project",
          is_public: false,
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
      }).success,
    ).toBe(true);
  });

  it("accepts get_project partial failure nulls and warnings", () => {
    expect(
      getProjectOutputSchema.safeParse({
        project: {
          id: 1,
          identifier: "mcp-test",
          name: "MCP Test Project",
        },
        trackers: [],
        categories: [],
        custom_fields: [],
        versions: null,
        members: [],
        priorities: null,
        warnings: [
          "versions: unavailable",
          "priorities: unavailable",
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts summarized project pagination", () => {
    expect(
      listProjectsOutputSchema.safeParse({
        items: [
          {
            id: 1,
            identifier: "mcp-test",
            name: "MCP Test Project",
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 25,
      }).success,
    ).toBe(true);
  });

  it("accepts summarized search pagination", () => {
    expect(
      searchOutputSchema.safeParse({
        items: [
          {
            id: 101,
            title: "Authentication fails for invalid API token",
            type: "issue",
            url: "http://redmine.test/issues/101",
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 10,
      }).success,
    ).toBe(true);
  });
});
