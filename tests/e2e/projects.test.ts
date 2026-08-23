import { describe, expect, it } from "vitest";

import {
  connectE2eClient,
  requireTextContent,
} from "./helpers.js";

describe("Project read-only MCP E2E", () => {
  it("keeps list_projects summarized and returns get_project as a stable envelope", async () => {
    const { client } = await connectE2eClient(
      "redmine-mcp-projects-e2e-client",
    );

    try {
      const listResult = await client.callTool({
        name: "redmine_list_projects",
        arguments: { limit: 20 },
      });

      expect(listResult.isError).not.toBe(true);

      const list = JSON.parse(
        requireTextContent(listResult.content),
      ) as {
        items: Array<
          Record<string, unknown> & {
            id: number;
            identifier: string;
          }
        >;
      };

      const target = list.items.find(
        ({ identifier }) => identifier === "mcp-test",
      );

      expect(target).toBeDefined();

      for (const item of list.items) {
        expect(item).not.toHaveProperty("description");
        expect(item).not.toHaveProperty("trackers");
        expect(item).not.toHaveProperty("issueCategories");
        expect(item).not.toHaveProperty("issueCustomFields");
      }

      if (!target) {
        throw new Error("MCP Test Project was not found");
      }

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
        project: Record<string, unknown>;
        trackers: unknown[];
        categories: unknown[];
        custom_fields: Array<Record<string, unknown>>;
        versions: null;
        members: null;
        priorities: null;
        warnings: unknown[];
      };

      expect(envelope.project).toHaveProperty("id");
      expect(envelope.project).toHaveProperty(
        "identifier",
        "mcp-test",
      );
      expect(envelope.project).toHaveProperty(
        "name",
        "MCP Test Project",
      );

      expect(envelope.project).not.toHaveProperty("trackers");
      expect(envelope.project).not.toHaveProperty("issueCategories");
      expect(envelope.project).not.toHaveProperty(
        "issueCustomFields",
      );
      expect(envelope.project).not.toHaveProperty("isPublic");
      expect(envelope.project).not.toHaveProperty("createdOn");
      expect(envelope.project).not.toHaveProperty("updatedOn");

      expect(Array.isArray(envelope.trackers)).toBe(true);
      expect(Array.isArray(envelope.categories)).toBe(true);
      expect(Array.isArray(envelope.custom_fields)).toBe(true);

      for (const field of envelope.custom_fields) {
        expect(field).not.toHaveProperty("fieldFormat");
        expect(field).not.toHaveProperty("isRequired");
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
