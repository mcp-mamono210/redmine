import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

interface JsonResponse {
  status: number;
  body: unknown;
}

interface IssueSummary {
  id: number;
  subject: string;
}

interface IssuesResponse {
  issues: IssueSummary[];
}

interface IssueResponse {
  issue: {
    id: number;
    subject: string;
    journals?: Array<{
      notes: string;
    }>;
  };
}

interface CurrentUserResponse {
  user: {
    login: string;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required for permission integration tests`,
    );
  }

  return value;
}

const redmineUrl = requireEnv("REDMINE_URL");
const readOnlyApiKey = requireEnv("REDMINE_API_KEY");
const writerApiKey = requireEnv("REDMINE_WRITE_API_KEY");

function asRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

async function request(
  apiKey: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<JsonResponse> {
  const url = new URL(
    path.replace(/^\/+/u, ""),
    redmineUrl.endsWith("/") ? redmineUrl : `${redmineUrl}/`,
  );

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Redmine-API-Key": apiKey,
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    });
  } catch (error) {
    throw new Error(
      `Redmine request failed before receiving a response: ${method} ${url.pathname}`,
      { cause: error },
    );
  }

  const text = await response.text();

  if (!text) {
    return {
      status: response.status,
      body: null,
    };
  }

  try {
    return {
      status: response.status,
      body: JSON.parse(text) as unknown,
    };
  } catch {
    return {
      status: response.status,
      body: text,
    };
  }
}

function expectNoCredentialLeak(response: JsonResponse): void {
  const serialized = JSON.stringify(response.body);

  expect(serialized).not.toContain(readOnlyApiKey);
  expect(serialized).not.toContain(writerApiKey);
  expect(serialized).not.toContain("X-Redmine-API-Key");
  expect(serialized).not.toContain("Authorization");
}

function requireIssueResponse(response: JsonResponse): IssueResponse {
  const record = asRecord(response.body, "issue response");
  const issue = asRecord(record.issue, "issue response.issue");

  if (
    typeof issue.id !== "number" ||
    typeof issue.subject !== "string"
  ) {
    throw new Error("issue response did not contain id and subject");
  }

  const journals =
    issue.journals === undefined
      ? undefined
      : Array.isArray(issue.journals)
        ? issue.journals.map((journal) => {
            const journalRecord = asRecord(
              journal,
              "issue response.issue.journals[]",
            );

            if (typeof journalRecord.notes !== "string") {
              throw new Error(
                "issue journal did not contain notes",
              );
            }

            return {
              notes: journalRecord.notes,
            };
          })
        : undefined;

  return {
    issue: {
      id: issue.id,
      subject: issue.subject,
      ...(journals === undefined ? {} : { journals }),
    },
  };
}

function requireIssuesResponse(response: JsonResponse): IssuesResponse {
  const record = asRecord(response.body, "issues response");

  if (!Array.isArray(record.issues)) {
    throw new Error("issues response did not contain issues");
  }

  return {
    issues: record.issues.map((issue) => {
      const issueRecord = asRecord(
        issue,
        "issues response.issues[]",
      );

      if (
        typeof issueRecord.id !== "number" ||
        typeof issueRecord.subject !== "string"
      ) {
        throw new Error(
          "issue summary did not contain id and subject",
        );
      }

      return {
        id: issueRecord.id,
        subject: issueRecord.subject,
      };
    }),
  };
}

async function findSeededIssue(): Promise<IssueSummary> {
  const response = await request(
    readOnlyApiKey,
    "GET",
    "/issues.json?project_id=mcp-test&subject=~Authentication%20fails&limit=10",
  );

  expect(response.status).toBe(200);
  expectNoCredentialLeak(response);

  const issue = requireIssuesResponse(response).issues.find(
    ({ subject }) =>
      subject ===
      "Authentication fails for invalid API token",
  );

  if (!issue) {
    throw new Error("Representative seeded issue was not found");
  }

  return issue;
}

async function findBugTrackerId(): Promise<number> {
  const response = await request(
    writerApiKey,
    "GET",
    "/projects/mcp-test.json?include=trackers",
  );

  expect(response.status).toBe(200);
  expectNoCredentialLeak(response);

  const record = asRecord(response.body, "project response");
  const project = asRecord(
    record.project,
    "project response.project",
  );
  const trackers = project.trackers;

  if (!Array.isArray(trackers)) {
    throw new Error("project response did not contain trackers");
  }

  for (const tracker of trackers) {
    const trackerRecord = asRecord(
      tracker,
      "project response.project.trackers[]",
    );

    if (
      trackerRecord.name === "Bug" &&
      typeof trackerRecord.id === "number"
    ) {
      return trackerRecord.id;
    }
  }

  throw new Error("Bug tracker was not found");
}

describe("Redmine read-only / writer permission boundary", () => {
  let seededIssue: IssueSummary;
  let bugTrackerId: number;

  beforeAll(async () => {
    const readOnlyCurrentUser = await request(
      readOnlyApiKey,
      "GET",
      "/users/current.json",
    );
    const writerCurrentUser = await request(
      writerApiKey,
      "GET",
      "/users/current.json",
    );

    expect(readOnlyCurrentUser.status).toBe(200);
    expect(writerCurrentUser.status).toBe(200);

    const readOnlyUser = asRecord(
      asRecord(
        readOnlyCurrentUser.body,
        "read-only current user response",
      ).user,
      "read-only current user response.user",
    ) as unknown as CurrentUserResponse["user"];

    const writerUser = asRecord(
      asRecord(
        writerCurrentUser.body,
        "writer current user response",
      ).user,
      "writer current user response.user",
    ) as unknown as CurrentUserResponse["user"];

    expect(readOnlyUser.login).toBe("mcp-test");
    expect(writerUser.login).toBe("mcp-writer");

    seededIssue = await findSeededIssue();
    bugTrackerId = await findBugTrackerId();
  });

  it("rejects create, update, and note operations for the read-only user", async () => {
    const attemptedSubject =
      `Read-only permission test ${randomUUID()}`;

    const createResponse = await request(
      readOnlyApiKey,
      "POST",
      "/issues.json",
      {
        issue: {
          project_id: "mcp-test",
          tracker_id: bugTrackerId,
          subject: attemptedSubject,
        },
      },
    );

    expect(createResponse.status).toBe(403);
    expectNoCredentialLeak(createResponse);

    const lookupResponse = await request(
      readOnlyApiKey,
      "GET",
      `/issues.json?project_id=mcp-test&subject=~${encodeURIComponent(
        attemptedSubject,
      )}&limit=10`,
    );

    expect(lookupResponse.status).toBe(200);
    expect(
      requireIssuesResponse(lookupResponse).issues.some(
        ({ subject }) => subject === attemptedSubject,
      ),
    ).toBe(false);

    const beforeResponse = await request(
      readOnlyApiKey,
      "GET",
      `/issues/${seededIssue.id}.json?include=journals`,
    );

    expect(beforeResponse.status).toBe(200);

    const before = requireIssueResponse(beforeResponse);
    const forbiddenSubject =
      `Forbidden update ${randomUUID()}`;

    const updateResponse = await request(
      readOnlyApiKey,
      "PUT",
      `/issues/${seededIssue.id}.json`,
      {
        issue: {
          subject: forbiddenSubject,
        },
      },
    );

    expect(updateResponse.status).toBe(403);
    expectNoCredentialLeak(updateResponse);

    const forbiddenNote =
      `Forbidden note ${randomUUID()}`;

    const noteResponse = await request(
      readOnlyApiKey,
      "PUT",
      `/issues/${seededIssue.id}.json`,
      {
        issue: {
          notes: forbiddenNote,
        },
      },
    );

    expect(noteResponse.status).toBe(403);
    expectNoCredentialLeak(noteResponse);

    const afterResponse = await request(
      readOnlyApiKey,
      "GET",
      `/issues/${seededIssue.id}.json?include=journals`,
    );

    expect(afterResponse.status).toBe(200);

    const after = requireIssueResponse(afterResponse);

    expect(after.issue.subject).toBe(before.issue.subject);
    expect(after.issue.subject).not.toBe(forbiddenSubject);
    expect(
      after.issue.journals?.some(
        ({ notes }) => notes === forbiddenNote,
      ),
    ).toBe(false);
  });

  it("allows the writer user to create, update, and add a note in the primary test project", async () => {
    const createdSubject =
      `Writer permission test ${randomUUID()}`;
    const updatedSubject =
      `Writer permission updated ${randomUUID()}`;
    const note =
      `Writer permission note ${randomUUID()}`;

    const createResponse = await request(
      writerApiKey,
      "POST",
      "/issues.json",
      {
        issue: {
          project_id: "mcp-test",
          tracker_id: bugTrackerId,
          subject: createdSubject,
          description:
            "Synthetic issue created by the permission boundary integration test.",
        },
      },
    );

    expect(createResponse.status).toBe(201);
    expectNoCredentialLeak(createResponse);

    const created = requireIssueResponse(createResponse);

    expect(created.issue.subject).toBe(createdSubject);

    const updateResponse = await request(
      writerApiKey,
      "PUT",
      `/issues/${created.issue.id}.json`,
      {
        issue: {
          subject: updatedSubject,
        },
      },
    );

    expect(updateResponse.status).toBe(204);
    expectNoCredentialLeak(updateResponse);

    const noteResponse = await request(
      writerApiKey,
      "PUT",
      `/issues/${created.issue.id}.json`,
      {
        issue: {
          notes: note,
        },
      },
    );

    expect(noteResponse.status).toBe(204);
    expectNoCredentialLeak(noteResponse);

    const verifyResponse = await request(
      writerApiKey,
      "GET",
      `/issues/${created.issue.id}.json?include=journals`,
    );

    expect(verifyResponse.status).toBe(200);
    expectNoCredentialLeak(verifyResponse);

    const verified = requireIssueResponse(verifyResponse);

    expect(verified.issue.subject).toBe(updatedSubject);
    expect(
      verified.issue.journals?.some(
        ({ notes }) => notes === note,
      ),
    ).toBe(true);
  });

  it("keeps the writer scoped away from the secondary private project", async () => {
    const response = await request(
      writerApiKey,
      "GET",
      "/projects/mcp-secondary.json",
    );

    expect([403, 404]).toContain(response.status);
    expectNoCredentialLeak(response);
  });
});
