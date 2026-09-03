import { describe, expect, it } from "vitest";

import { RedmineClient } from "../../src/redmine/client.js";

const baseUrl = "http://redmine.example.test";
const apiKey = "0123456789abcdef0123456789abcdef01234567";

function rawIssue(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    issue: {
      id: 42,
      project: { id: 1, name: "MCP Test Project" },
      tracker: { id: 1, name: "Bug" },
      status: { id: 1, name: "New", is_closed: false },
      priority: { id: 2, name: "Normal" },
      author: { id: 7, name: "MCP Test" },
      subject: "Representative issue",
      description: "Issue detail",
      custom_fields: [],
      ...extra,
    },
  });
}

function toUrl(input: string | URL | Request): URL {
  if (input instanceof Request) {
    return new URL(input.url);
  }

  return new URL(input.toString());
}

describe("RedmineClient issue include contract", () => {
  it("normalizes null custom field values to the public empty-string representation", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          rawIssue({
            custom_fields: [
              {
                id: 10,
                name: "release_tag",
                value: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const client = new RedmineClient({
      baseUrl,
      apiKey,
      fetchImpl,
    });

    const issue = await client.getIssue(42);

    expect(issue.customFields).toEqual([
      {
        id: 10,
        name: "release_tag",
        value: "",
      },
    ]);
  });

  it("accepts null custom field values in bounded issue lists", async () => {
    const issue = JSON.parse(rawIssue()) as {
      issue: Record<string, unknown>;
    };
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          issues: [
            {
              ...issue.issue,
              custom_fields: [
                {
                  id: 10,
                  name: "release_tag",
                  value: null,
                },
              ],
            },
          ],
          total_count: 1,
          offset: 0,
          limit: 10,
        }),
      );

    const client = new RedmineClient({
      baseUrl,
      apiKey,
      fetchImpl,
    });

    const result = await client.listIssues();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("customFields");
  });

  it("omits the include query parameter by default", async () => {
    let requestUrl: URL | undefined;

    const fetchImpl: typeof fetch = (input) => {
      requestUrl = toUrl(input);
      return Promise.resolve(
        new Response(rawIssue(), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );
    };

    const client = new RedmineClient({
      baseUrl,
      apiKey,
      fetchImpl,
    });

    const issue = await client.getIssue(42);

    expect(requestUrl).toBeDefined();
    expect(requestUrl?.searchParams.has("include")).toBe(false);
    expect(issue).not.toHaveProperty("journals");
    expect(issue).not.toHaveProperty("relations");
    expect(issue).not.toHaveProperty("children");
    expect(issue).not.toHaveProperty("attachments");
    expect(issue).not.toHaveProperty("allowedStatuses");
  });

  it("serializes multiple includes as a comma-separated query parameter", async () => {
    let requestUrl: URL | undefined;

    const fetchImpl: typeof fetch = (input) => {
      requestUrl = toUrl(input);
      return Promise.resolve(
        new Response(
          rawIssue({
            journals: [],
            relations: [],
            allowed_statuses: [
              { id: 2, name: "In Progress", is_closed: false },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    };

    const client = new RedmineClient({
      baseUrl,
      apiKey,
      fetchImpl,
    });

    const issue = await client.getIssue(42, {
      include: [
        "journals",
        "relations",
        "allowed_statuses",
      ],
    });

    expect(requestUrl?.searchParams.get("include")).toBe(
      "journals,relations,allowed_statuses",
    );
    expect(issue.journals).toEqual([]);
    expect(issue.relations).toEqual([]);
    expect(issue.allowedStatuses).toEqual([
      { id: 2, name: "In Progress" },
    ]);
  });

  it("normalizes children and attachment metadata", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          rawIssue({
            children: [
              {
                id: 43,
                tracker: { id: 3, name: "Task" },
                subject: "Child task",
                children: [
                  {
                    id: 44,
                    tracker: { id: 3, name: "Task" },
                    subject: "Nested child task",
                  },
                ],
              },
            ],
            attachments: [
              {
                id: 10,
                filename: "evidence.txt",
                filesize: 12,
                content_type: "text/plain",
                description: "Evidence",
                content_url:
                  "http://redmine.example.test/attachments/download/10/evidence.txt",
                author: { id: 7, name: "MCP Test" },
                created_on: "2026-08-23T00:00:00Z",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const client = new RedmineClient({
      baseUrl,
      apiKey,
      fetchImpl,
    });

    const issue = await client.getIssue(42, {
      include: ["children", "attachments"],
    });

    expect(issue.children).toEqual([
      {
        id: 43,
        tracker: { id: 3, name: "Task" },
        subject: "Child task",
        children: [
          {
            id: 44,
            tracker: { id: 3, name: "Task" },
            subject: "Nested child task",
          },
        ],
      },
    ]);

    expect(issue.attachments).toEqual([
      {
        id: 10,
        filename: "evidence.txt",
        filesize: 12,
        contentType: "text/plain",
        description: "Evidence",
        contentUrl:
          "http://redmine.example.test/attachments/download/10/evidence.txt",
        author: { id: 7, name: "MCP Test" },
        createdOn: "2026-08-23T00:00:00Z",
      },
    ]);
  });
});
