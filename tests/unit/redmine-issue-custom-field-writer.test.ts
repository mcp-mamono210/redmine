import { describe, expect, it, vi } from "vitest";

import {
  RedmineHttpAgentBriefLifecycleWriter,
  type AgentBriefLifecycleCustomFieldIds,
} from "../../src/redmine/issue-custom-field-writer.js";

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const FIELD_IDS: AgentBriefLifecycleCustomFieldIds = {
  lifecycle: 11,
  approvedBy: 12,
  approvedAt: 13,
  approvedBriefRevision: 14,
  approvedPersistedRevision: 15,
  approvedRequirementsFingerprint: 16,
};

function response(
  status: number,
  body = "",
  statusText = status === 204 ? "No Content" : "Error",
): Response {
  return new Response(status === 204 ? null : body, { status, statusText });
}

describe("RedmineHttpAgentBriefLifecycleWriter", () => {
  it("writes only the canonical Agent Brief lifecycle fields and accepts Redmine 204 responses", async () => {
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(response(204)),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const writer = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: "https://redmine.example.test",
      apiKey: "shared-redmine-secret",
      fetchImpl,
    });

    await writer.updateAgentBriefLifecycleFields(
      5366,
      FIELD_IDS,
      {
        lifecycle: "Ready for Agent",
        approvedBy: "redmine-user:42",
        approvedAt: "2026-09-07T04:00:00Z",
        approvedBriefRevision: "3",
        approvedPersistedRevision: "persisted-revision",
        approvedRequirementsFingerprint: `sha256:${"a".repeat(64)}`,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) {
      throw new Error("expected fetch input to be a URL");
    }
    expect(url.href).toBe(
      "https://redmine.example.test/issues/5366.json",
    );
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(
      JSON.stringify({
        issue: {
          custom_fields: [
            { id: 11, value: "Ready for Agent" },
            { id: 12, value: "redmine-user:42" },
            { id: 13, value: "2026-09-07T04:00:00Z" },
            { id: 14, value: "3" },
            { id: 15, value: "persisted-revision" },
            {
              id: 16,
              value: `sha256:${"a".repeat(64)}`,
            },
          ],
        },
      }),
    );
  });

  it("writes only lifecycle when approval metadata is not part of the transition", async () => {
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(response(204)),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const writer = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: "https://redmine.example.test",
      apiKey: "shared-redmine-secret",
      fetchImpl,
    });

    await writer.updateAgentBriefLifecycleFields(
      5366,
      FIELD_IDS,
      { lifecycle: "Brief Ready" },
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe(
      JSON.stringify({
        issue: {
          custom_fields: [{ id: 11, value: "Brief Ready" }],
        },
      }),
    );
  });

  it("does not include the injected Redmine API key in HTTP errors", async () => {
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(
        response(
          422,
          JSON.stringify({ errors: ["invalid value"] }),
          "Unprocessable Entity",
        ),
      ),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const writer = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: "https://redmine.example.test",
      apiKey: "shared-redmine-secret",
      fetchImpl,
    });

    await expect(
      writer.updateAgentBriefLifecycleFields(
        5366,
        FIELD_IDS,
        { lifecycle: "invalid" },
      ),
    ).rejects.toMatchObject({
      method: "PUT",
      path: "/issues/5366.json",
      status: 422,
      errors: ["invalid value"],
    });

    try {
      await writer.updateAgentBriefLifecycleFields(
        5366,
        FIELD_IDS,
        { lifecycle: "invalid" },
      );
    } catch (error) {
      expect(String(error)).not.toContain("shared-redmine-secret");
    }
  });

  it("rejects invalid or duplicate canonical field IDs before making a request", async () => {
    const fetchMock = vi.fn();
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const writer = new RedmineHttpAgentBriefLifecycleWriter({
      baseUrl: "https://redmine.example.test",
      apiKey: "shared-redmine-secret",
      fetchImpl,
    });

    await expect(
      writer.updateAgentBriefLifecycleFields(
        5366,
        { ...FIELD_IDS, approvedBy: FIELD_IDS.lifecycle },
        { lifecycle: "Brief Ready" },
      ),
    ).rejects.toThrow("must be unique");

    await expect(
      writer.updateAgentBriefLifecycleFields(
        5366,
        { ...FIELD_IDS, lifecycle: 0 },
        { lifecycle: "Brief Ready" },
      ),
    ).rejects.toThrow("positive integers");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
