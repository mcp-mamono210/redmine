import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { RedmineClient } from "../../src/redmine/client.js";
import type { RedmineIssueSummary } from "../../src/redmine/types.js";
import {
  createReadOnlyTestClient,
  createWriterTestClient,
  getRedmineWriterTestEnvironment,
} from "../helpers/redmine-environment.js";
import {
  AUTHENTICATION_FIXTURE_SUBJECT,
  PRIMARY_TEST_PROJECT_IDENTIFIER,
  SECONDARY_TEST_PROJECT_IDENTIFIER,
  findSeededIssue,
  findTrackerId,
} from "../helpers/redmine-fixtures.js";
import {
  RedmineTestHttpClient,
  requireRecord,
  type RedmineTestHttpResponse,
} from "../helpers/redmine-http.js";

interface CreatedIssue {
  id: number;
  subject: string;
}

interface IssueVerification {
  issue: {
    subject: string;
    journals?: Array<{
      notes: string;
    }>;
  };
}

const {
  redmineUrl,
  readOnlyApiKey,
  writerApiKey,
} = getRedmineWriterTestEnvironment();

const readOnlyHttp = new RedmineTestHttpClient({
  baseUrl: redmineUrl,
  apiKey: readOnlyApiKey,
});

const writerHttp = new RedmineTestHttpClient({
  baseUrl: redmineUrl,
  apiKey: writerApiKey,
});

function expectNoCredentialLeak(
  response: RedmineTestHttpResponse,
): void {
  const serialized = JSON.stringify(response.body);

  expect(serialized).not.toContain(readOnlyApiKey);
  expect(serialized).not.toContain(writerApiKey);
  expect(serialized).not.toContain(
    "X-Redmine-API-Key",
  );
  expect(serialized).not.toContain("Authorization");
}

function requireCreatedIssue(
  response: RedmineTestHttpResponse,
): CreatedIssue {
  const body = requireRecord(
    response.body,
    "create issue response",
  );
  const issue = requireRecord(
    body.issue,
    "create issue response.issue",
  );

  if (
    typeof issue.id !== "number" ||
    typeof issue.subject !== "string"
  ) {
    throw new Error(
      "create issue response did not contain id and subject",
    );
  }

  return {
    id: issue.id,
    subject: issue.subject,
  };
}

function requireIssueVerification(
  response: RedmineTestHttpResponse,
): IssueVerification {
  const body = requireRecord(
    response.body,
    "issue verification response",
  );
  const issue = requireRecord(
    body.issue,
    "issue verification response.issue",
  );

  if (typeof issue.subject !== "string") {
    throw new Error(
      "issue verification response did not contain subject",
    );
  }

  let journals:
    | Array<{
        notes: string;
      }>
    | undefined;

  if (issue.journals !== undefined) {
    if (!Array.isArray(issue.journals)) {
      throw new Error(
        "issue verification response journals must be an array",
      );
    }

    journals = issue.journals.map((journal) => {
      const journalRecord = requireRecord(
        journal,
        "issue verification response.issue.journals[]",
      );

      if (typeof journalRecord.notes !== "string") {
        throw new Error(
          "issue verification journal did not contain notes",
        );
      }

      return {
        notes: journalRecord.notes,
      };
    });
  }

  return {
    issue: {
      subject: issue.subject,
      ...(journals === undefined ? {} : { journals }),
    },
  };
}

describe("Redmine read-only / writer permission boundary", () => {
  let readOnlyClient: RedmineClient;
  let writerClient: RedmineClient;
  let seededIssue: RedmineIssueSummary;
  let bugTrackerId: number;

  beforeAll(async () => {
    readOnlyClient = createReadOnlyTestClient();
    writerClient = createWriterTestClient();

    const readOnlyCurrentUser =
      await readOnlyClient.getCurrentUser();
    const writerCurrentUser =
      await writerClient.getCurrentUser();

    expect(readOnlyCurrentUser.login).toBe("mcp-test");
    expect(writerCurrentUser.login).toBe("mcp-writer");

    seededIssue = await findSeededIssue(
      readOnlyClient,
      AUTHENTICATION_FIXTURE_SUBJECT,
    );
    bugTrackerId = await findTrackerId(
      writerClient,
      PRIMARY_TEST_PROJECT_IDENTIFIER,
      "Bug",
    );
  });

  it("rejects create, update, and note operations for the read-only user", async () => {
    const attemptedSubject =
      `Read-only permission test ${randomUUID()}`;

    const createResponse = await readOnlyHttp.request(
      "POST",
      "/issues.json",
      {
        issue: {
          project_id:
            PRIMARY_TEST_PROJECT_IDENTIFIER,
          tracker_id: bugTrackerId,
          subject: attemptedSubject,
        },
      },
    );

    expect(createResponse.status).toBe(403);
    expectNoCredentialLeak(createResponse);

    const lookupResponse =
      await readOnlyClient.listIssues({
        projectId:
          PRIMARY_TEST_PROJECT_IDENTIFIER,
        subject: attemptedSubject,
        limit: 10,
      });

    expect(
      lookupResponse.items.some(
        ({ subject }) => subject === attemptedSubject,
      ),
    ).toBe(false);

    const before = await readOnlyClient.getIssue(
      seededIssue.id,
      {
        include: ["journals"],
      },
    );

    const forbiddenSubject =
      `Forbidden update ${randomUUID()}`;

    const updateResponse = await readOnlyHttp.request(
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

    const noteResponse = await readOnlyHttp.request(
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

    const after = await readOnlyClient.getIssue(
      seededIssue.id,
      {
        include: ["journals"],
      },
    );

    expect(after.subject).toBe(before.subject);
    expect(after.subject).not.toBe(forbiddenSubject);
    expect(
      after.journals?.some(
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

    const createResponse = await writerHttp.request(
      "POST",
      "/issues.json",
      {
        issue: {
          project_id:
            PRIMARY_TEST_PROJECT_IDENTIFIER,
          tracker_id: bugTrackerId,
          subject: createdSubject,
          description:
            "Synthetic issue created by the permission boundary integration test.",
        },
      },
    );

    expect(createResponse.status).toBe(201);
    expectNoCredentialLeak(createResponse);

    const created =
      requireCreatedIssue(createResponse);

    expect(created.subject).toBe(createdSubject);

    const updateResponse = await writerHttp.request(
      "PUT",
      `/issues/${created.id}.json`,
      {
        issue: {
          subject: updatedSubject,
        },
      },
    );

    expect(updateResponse.status).toBe(204);
    expectNoCredentialLeak(updateResponse);

    const noteResponse = await writerHttp.request(
      "PUT",
      `/issues/${created.id}.json`,
      {
        issue: {
          notes: note,
        },
      },
    );

    expect(noteResponse.status).toBe(204);
    expectNoCredentialLeak(noteResponse);

    const verifyResponse = await writerHttp.request(
      "GET",
      `/issues/${created.id}.json?include=journals`,
    );

    expect(verifyResponse.status).toBe(200);
    expectNoCredentialLeak(verifyResponse);

    const verified =
      requireIssueVerification(verifyResponse);

    expect(verified.issue.subject).toBe(
      updatedSubject,
    );
    expect(
      verified.issue.journals?.some(
        ({ notes }) => notes === note,
      ),
    ).toBe(true);
  });

  it("keeps the writer scoped away from the secondary private project", async () => {
    const response = await writerHttp.request(
      "GET",
      `/projects/${SECONDARY_TEST_PROJECT_IDENTIFIER}.json`,
    );

    expect([403, 404]).toContain(response.status);
    expectNoCredentialLeak(response);
  });
});
