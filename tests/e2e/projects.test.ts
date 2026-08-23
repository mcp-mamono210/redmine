import { describe, expect, it } from "vitest";

import {
  connectE2eClient,
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
  it("keeps list_projects summarized and get_project as a stable envelope", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-projects-e2e-client",
    );

    try {
      const listResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: {
          limit: 20,
        },
      });

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
        expect(item).not.toHaveProperty("categories");
        expect(item).not.toHaveProperty("issue_categories");
        expect(item).not.toHaveProperty("custom_fields");
        expect(item).not.toHaveProperty("versions");
        expect(item).not.toHaveProperty("members");
        expect(item).not.toHaveProperty("priorities");
        expect(item).not.toHaveProperty("warnings");
      }

      if (!target) {
        throw new Error("MCP Test Project was not found");
      }

      expect(target.name).toBe("MCP Test Project");

      const getResult = await client.callTool({
        name: "redmine_get_project",
        arguments: {
          project_id: target.identifier,
        },
      });

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
        versions: null;
        members: null;
        priorities: null;
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
      expect(envelope.project).not.toHaveProperty("issue_categories");
      expect(envelope.project).not.toHaveProperty("custom_fields");
      expect(envelope.project).not.toHaveProperty("issueCategories");
      expect(envelope.project).not.toHaveProperty("issueCustomFields");
      expect(envelope.project).not.toHaveProperty("isPublic");
      expect(envelope.project).not.toHaveProperty("createdOn");
      expect(envelope.project).not.toHaveProperty("updatedOn");

      const trackerNames = envelope.trackers.map(
        ({ name }) => name,
      );

      expect(trackerNames).toEqual(
        expect.arrayContaining(["Bug", "Feature", "Task"]),
      );

      expect(envelope.categories).toEqual([]);

      const releaseTag = envelope.custom_fields.find(
        ({ name }) => name === "release_tag",
      );

      expect(releaseTag).toBeDefined();

      if (!releaseTag) {
        throw new Error(
          "release_tag custom field metadata was not found",
        );
      }

      expect(releaseTag.id).toBeGreaterThan(0);
      expect(releaseTag.name).toBe("release_tag");
      expect(releaseTag).not.toHaveProperty("fieldFormat");
      expect(releaseTag).not.toHaveProperty("isRequired");

      if (releaseTag.field_format !== undefined) {
        expect(typeof releaseTag.field_format).toBe("string");
      }

      if (releaseTag.is_required !== undefined) {
        expect(typeof releaseTag.is_required).toBe("boolean");
      }

      expect(envelope.versions).toBeNull();
      expect(envelope.members).toBeNull();
      expect(envelope.priorities).toBeNull();
      expect(envelope.warnings).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
