import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), ".circleci/config.yml"), "utf8");
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const reproducibilityScript = readFileSync(
  resolve(process.cwd(), "scripts/ci/reproducibility.sh"),
  "utf8",
);

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

describe("CI reproducibility execution contract", () => {
  it("keeps canonical local commands and narrow CI primitives separate", () => {
    expect(packageJson.scripts["test:e2e"]).toBe("npm run build && npm run test:e2e:ci");
    expect(packageJson.scripts["test:e2e:ci"]).toBe(
      "vitest run tests/e2e --no-file-parallelism",
    );

    expect(packageJson.scripts["context:measure"]).toBe(
      "npm run redmine:reset && npm run build && npm run context:measure:ci",
    );
    expect(packageJson.scripts["context:measure:ci"]).toBe(
      "COMPARE_CONTEXT_BASELINE=1 vitest run tests/e2e/context-measurement.test.ts --reporter=verbose",
    );

    expect(packageJson.scripts["test:e2e:ci"]).not.toContain("build");
    expect(packageJson.scripts["test:e2e:ci"]).not.toContain("redmine:reset");
    expect(packageJson.scripts["context:measure:ci"]).not.toContain("build");
    expect(packageJson.scripts["context:measure:ci"]).not.toContain("redmine:reset");
  });

  it("runs normal stateful verification once with explicit prerequisite ownership", () => {
    const integrationJob = extractJob(config, "integration");
    const e2eJob = extractJob(config, "e2e");
    const contextJob = extractJob(config, "context_budget");

    expect(integrationJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(integrationJob.match(/npm run test:integration/gu)).toHaveLength(1);

    expect(e2eJob.match(/npm run build/gu)).toHaveLength(1);
    expect(e2eJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(e2eJob.match(/npm run test:e2e:ci/gu)).toHaveLength(1);
    expect(e2eJob).not.toContain("npm run test:e2e\n");

    expect(contextJob.match(/npm run build/gu)).toHaveLength(1);
    expect(contextJob.match(/npm run redmine:reset/gu)).toHaveLength(1);
    expect(contextJob.match(/npm run context:measure:ci/gu)).toHaveLength(1);
    expect(contextJob).not.toContain("command: npm run context:measure\n");
  });

  it("provides an explicit reproducibility gate disabled by default", () => {
    expect(config).toContain("run_reproducibility:");
    expect(config).toContain("default: false");

    const job = extractJob(config, "reproducibility");
    expect(job).toContain("machine:");
    expect(job).toContain("command: npm run ci:reproducibility");

    const workflows = extractTopLevelBlock(config, "workflows");
    expect(workflows).toContain("  reproducibility:");
    expect(workflows).toContain("when: << pipeline.parameters.run_reproducibility >>");
    expect(workflows).toContain("      - reproducibility");
  });

  it("repeats each stateful verification twice from fresh deterministic resets", () => {
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run test:integration/gu)).toHaveLength(2);
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run test:e2e:ci/gu)).toHaveLength(2);
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run context:measure:ci/gu)).toHaveLength(2);
    expect(reproducibilityScript.match(/run_with_fresh_redmine/gu)).toHaveLength(7);
  });

  it("builds once for the reproducibility gate and always cleans up Redmine", () => {
    expect(reproducibilityScript.match(/npm run build/gu)).toHaveLength(1);
    expect(reproducibilityScript).toContain("trap cleanup EXIT");
    expect(reproducibilityScript).toContain("npm run redmine:stop");
  });

  it("does not allow CI to update the Context Budget baseline", () => {
    expect(config).not.toContain("context:baseline:update");
    expect(reproducibilityScript).not.toContain("context:baseline:update");
  });
});
