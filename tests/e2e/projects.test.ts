import { describe, expect, it } from "vitest";

import {
  createMcpE2eHarness,
  requireTextContent,
} from "./helpers.js";

const EXPECTED_ENVELOPE_KEYS = [
  "categories",
  "custom_fields",
  "members",
  "priorities",
  "project",
  "trackers",
  "versions",
  "warnings",
] as const;

const PROJECT_SUMMARY_KEYS = new Set([
  "id",
  "identifier",
  "name",
  "parent_id",
]);

function expectOnlyKnownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    expect(
      allowedKeys.has(key),
      `Unexpected project summary key: ${key}`,
    ).toBe(true);
  }
}

function expectSnakeCaseKeys(
  value: unknown,
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      expectSnakeCaseKeys(item, `${path}[${index}]`);
    });
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    expect(
      key,
      `Public Project JSON key must not contain uppercase characters: ${path}.${key}`,
    ).not.toMatch(/[A-Z]/);
    expectSnakeCaseKeys(child, `${path}.${key}`);
  }
}

describe("Project read-only MCP E2E", () => {
  it("keeps list_projects summarized and aggregates get_project metadata", async () => {
    const harness = await createMcpE2eHarness({
      clientName: "redmine-mcp-projects-e2e-client",
    });

    try {
      const listResult = await harness.callTool(
        "redmine_list_projects",
        {
          limit: 20,
        },
      );

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(
        requireTextContent(listResult.content),
      ) as {
        items: Array<
          Record<string, unknown> & {
            id: number;
            identifier: string;
            name: string;
          }
        >;
      };

      const target = list.items.find(
        ({ identifier }) => identifier === "mcp-test",
      );

      expect(target).toBeDefined();

      for (const item of list.items) {
        expectOnlyKnownKeys(item, PROJECT_SUMMARY_KEYS);
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("identifier");
        expect(item).toHaveProperty("name");
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("trackers");
        expect(item).not.toHaveProperty("versions");
        expect(item).not.toHaveProperty("members");
        expect(item).not.toHaveProperty("priorities");
      }

      if (!target) {
        throw new Error("MCP Test Project was not found");
      }

      const getResult = await harness.callTool(
        "redmine_get_project",
        {
          project_id: target.identifier,
        },
      );

      expect(getResult.isError).not.toBe(true);

      const envelope = JSON.parse(
        requireTextContent(getResult.content),
      ) as {
        project: Record<string, unknown> & {
          id: number;
          identifier: string;
          name: string;
        };
        trackers: Array<{ id: number; name: string }>;
        categories: Array<{ id: number; name: string }>;
        custom_fields: Array<
          Record<string, unknown> & {
            id: number;
            name: string;
          }
        >;
        versions: Array<Record<string, unknown>> | null;
        members: Array<Record<string, unknown>> | null;
        priorities: Array<{ id: number; name: string }> | null;
        warnings: string[];
      };

      expect(Object.keys(envelope).sort()).toEqual(
        [...EXPECTED_ENVELOPE_KEYS].sort(),
      );
      expectSnakeCaseKeys(envelope);

      expect(envelope.project.id).toBe(target.id);
      expect(envelope.project.identifier).toBe("mcp-test");
      expect(envelope.project.name).toBe("MCP Test Project");

      expect(envelope.project).not.toHaveProperty("trackers");
      expect(envelope.project).not.toHaveProperty("categories");
      expect(envelope.project).not.toHaveProperty("custom_fields");
      expect(envelope.project).not.toHaveProperty("isPublic");

      expect(envelope.trackers.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["Bug", "Feature", "Task"]),
      );

      expect(envelope.categories).toEqual([]);

      const releaseTag = envelope.custom_fields.find(
        ({ name }) => name === "release_tag",
      );
      expect(releaseTag).toBeDefined();

      expect(Array.isArray(envelope.versions)).toBe(true);
      expect(Array.isArray(envelope.members)).toBe(true);
      expect(Array.isArray(envelope.priorities)).toBe(true);

      if (envelope.priorities) {
        expect(envelope.priorities.length).toBeGreaterThan(0);
      }

      expect(
        envelope.warnings.every(
          (warning) =>
            warning.startsWith("members: truncated to ") ||
            warning.endsWith(": unavailable"),
        ),
      ).toBe(true);
    } finally {
      await harness.close();
    }
  });
});
