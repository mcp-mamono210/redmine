import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CONFIG_PATH = resolve(process.cwd(), ".circleci/config.yml");
const config = readFileSync(CONFIG_PATH, "utf8");

function extractTopLevelBlock(source: string, heading: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `${heading}:`);
  if (start < 0) {
    throw new Error(`Missing top-level block: ${heading}`);
  }

  const block: string[] = [lines[start] ?? ""];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line && !line.startsWith(" ")) {
      break;
    }
    block.push(line);
  }

  return block.join("\n");
}

function extractJob(source: string, jobName: string): string {
  const jobsBlock = extractTopLevelBlock(source, "jobs");
  const lines = jobsBlock.split("\n");
  const marker = `  ${jobName}:`;
  const start = lines.findIndex((line) => line === marker);
  if (start < 0) {
    throw new Error(`Missing CircleCI job: ${jobName}`);
  }

  const block: string[] = [lines[start] ?? ""];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("  ") && !line.startsWith("    ") && line.endsWith(":")) {
      break;
    }
    block.push(line);
  }

  return block.join("\n");
}

describe("CI parallel execution topology", () => {
  it("defines independent static, unit, integration, e2e, and context-budget jobs", () => {
    for (const jobName of ["static", "unit", "integration", "e2e", "context_budget"]) {
      expect(() => extractJob(config, jobName)).not.toThrow();
    }

    expect(() => extractJob(config, "test")).toThrow("Missing CircleCI job: test");
  });

  it("uses Docker executors for stateless static and unit verification", () => {
    for (const jobName of ["static", "unit"]) {
      const job = extractJob(config, jobName);
      expect(job).toContain("docker:");
      expect(job).toContain("image: cimg/node:24.19.0");
      expect(job).toContain("- setup_docker_node");
      expect(job).not.toContain("machine:");
    }
  });

  it("keeps Redmine-backed verification on isolated machine executors", () => {
    for (const jobName of ["integration", "e2e", "context_budget"]) {
      const job = extractJob(config, jobName);
      expect(job).toContain("machine:");
      expect(job).toContain("image: ubuntu-2404:current");
      expect(job).toContain("- setup_machine_node");
      expect(job).not.toContain("docker:\n");
    }
  });

  it("schedules split normal verification jobs without workflow requires dependencies", () => {
    const workflows = extractTopLevelBlock(config, "workflows");
    const normalWorkflow = workflows.split("\n\n  reproducibility:")[0] ?? workflows;

    for (const jobName of ["static", "unit", "integration", "e2e", "context_budget"]) {
      expect(normalWorkflow).toContain(`      - ${jobName}`);
    }

    expect(normalWorkflow).not.toContain("requires:");
  });

  it("keeps unit verification independent from Redmine lifecycle commands", () => {
    const unitJob = extractJob(config, "unit");

    expect(unitJob).toContain("npm run test:unit");
    expect(unitJob).not.toContain("redmine:reset");
    expect(unitJob).not.toContain("redmine:stop");
  });

  it("keeps one normal reset boundary in each stateful verification job", () => {
    const integrationJob = extractJob(config, "integration");
    const e2eJob = extractJob(config, "e2e");
    const contextJob = extractJob(config, "context_budget");

    expect(integrationJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(integrationJob.match(/npm run test:integration/gu)).toHaveLength(1);
    expect(integrationJob).toContain("- stop_redmine");

    expect(e2eJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(e2eJob.match(/npm run test:e2e:ci/gu)).toHaveLength(1);
    expect(e2eJob).toContain("- stop_redmine");

    expect(contextJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(contextJob.match(/npm run context:measure:ci/gu)).toHaveLength(1);
    expect(contextJob).toContain("- stop_redmine");
  });

  it("keeps Redmine credentials scoped to stateful jobs", () => {
    const statefulJobs = ["integration", "e2e", "context_budget"].map((jobName) =>
      extractJob(config, jobName),
    );

    for (const job of statefulJobs) {
      expect(job).toContain("REDMINE_URL: http://localhost:3000");
      expect(job).toContain("REDMINE_API_KEY:");
      expect(job).toContain("REDMINE_WRITE_API_KEY:");
    }

    expect(extractJob(config, "static")).not.toContain("REDMINE_API_KEY");
    expect(extractJob(config, "unit")).not.toContain("REDMINE_API_KEY");
  });
});
