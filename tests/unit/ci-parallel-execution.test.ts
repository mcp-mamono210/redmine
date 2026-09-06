import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CONFIG_PATH = resolve(process.cwd(), ".circleci/continue_config.yml");
const config = readFileSync(CONFIG_PATH, "utf8");

function extractTopLevelBlock(source: string, heading: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `${heading}:`);
  if (start < 0) throw new Error(`Missing top-level block: ${heading}`);

  const block: string[] = [lines[start] ?? ""];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line && !line.startsWith(" ")) break;
    block.push(line);
  }
  return block.join("\n");
}

function extractJob(source: string, jobName: string): string {
  const jobs = extractTopLevelBlock(source, "jobs").split("\n");
  const marker = `  ${jobName}:`;
  const start = jobs.findIndex((line) => line === marker);
  if (start < 0) throw new Error(`Missing CircleCI job: ${jobName}`);

  const block: string[] = [jobs[start] ?? ""];
  for (let i = start + 1; i < jobs.length; i += 1) {
    const line = jobs[i] ?? "";
    if (line.startsWith("  ") && !line.startsWith("    ") && line.endsWith(":")) break;
    block.push(line);
  }
  return block.join("\n");
}

describe("CI parallel execution topology", () => {
  it("keeps the split verification jobs in continuation config", () => {
    for (const jobName of ["static", "unit", "integration", "e2e", "context_budget"]) {
      expect(() => extractJob(config, jobName)).not.toThrow();
    }
  });

  it("uses Docker executors for stateless verification", () => {
    for (const jobName of ["static", "unit"]) {
      const job = extractJob(config, jobName);
      expect(job).toContain("docker:");
      expect(job).toContain("image: cimg/node:24.19.0");
      expect(job).not.toContain("machine:");
    }
  });

  it("keeps Redmine-backed verification on machine executors", () => {
    for (const jobName of ["integration", "e2e", "context_budget"]) {
      const job = extractJob(config, jobName);
      expect(job).toContain("machine:");
      expect(job).toContain("image: ubuntu-2404:current");
    }
  });

  it("keeps Redmine credentials out of stateless jobs", () => {
    expect(extractJob(config, "static")).not.toContain("REDMINE_API_KEY");
    expect(extractJob(config, "unit")).not.toContain("REDMINE_API_KEY");
  });
});
