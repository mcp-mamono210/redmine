import type { RedmineClient } from "../../src/redmine/client.js";
import type { RedmineIssueSummary } from "../../src/redmine/types.js";

export const PRIMARY_TEST_PROJECT_IDENTIFIER =
  "mcp-test";

export const SECONDARY_TEST_PROJECT_IDENTIFIER =
  "mcp-secondary";

export const AUTHENTICATION_FIXTURE_SUBJECT =
  "Authentication fails for invalid API token";

export const JOURNAL_FIXTURE_SUBJECT =
  "Add issue listing support";

export async function findSeededIssue(
  client: RedmineClient,
  subject: string,
): Promise<RedmineIssueSummary> {
  const response = await client.listIssues({
    projectId: PRIMARY_TEST_PROJECT_IDENTIFIER,
    subject,
    limit: 10,
  });

  const issue = response.items.find(
    (item) => item.subject === subject,
  );

  if (!issue) {
    throw new Error(
      `Seeded Redmine issue was not found: ${subject}`,
    );
  }

  return issue;
}

export async function findTrackerId(
  client: RedmineClient,
  projectIdentifier: string,
  trackerName: string,
): Promise<number> {
  const project = await client.getProject(
    projectIdentifier,
    {
      include: ["trackers"],
    },
  );

  const tracker = project.trackers?.find(
    ({ name }) => name === trackerName,
  );

  if (!tracker) {
    throw new Error(
      `Redmine tracker was not found: ${trackerName}`,
    );
  }

  return tracker.id;
}
