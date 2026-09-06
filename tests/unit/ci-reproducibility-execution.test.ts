import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const setupConfig = readFileSync(
  resolve(process.cwd(), ".circleci/config.yml"),
  "utf8",
);
const continuationConfig = readFileSync(
  resolve(process.cwd(), ".circleci/continue_config.yml"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const reproducibilityScript = readFileSync(
  resolve(process.cwd(), "scripts/ci/reproducibility.sh"),
  "utf8",
);

describe("CI reproducibility execution contract", () => {
  it("keeps canonical local commands and narrow CI primitives separate", () => {
    expect(packageJson.scripts["test:e2e"]).toBe("npm run build && npm run test:e2e:ci");
    expect(packageJson.scripts["context:measure"]).toBe(
      "npm run redmine:reset && npm run build && npm run context:measure:ci",
    );
    expect(packageJson.scripts["test:e2e:ci"]).not.toContain("build");
    expect(packageJson.scripts["context:measure:ci"]).not.toContain("redmine:reset");
  });

  it("keeps manual reproducibility disabled by default in setup config", () => {
    expect(setupConfig).toContain("run_reproducibility:");
    expect(setupConfig).toContain("default: false");
    expect(continuationConfig).toContain("run_manual_reproducibility:");
    expect(continuationConfig).toContain("manual_reproducibility:");
  });

  it("keeps the reproducibility job in continuation config", () => {
    expect(continuationConfig).toContain("  reproducibility:");
    expect(continuationConfig).toContain("command: npm run ci:reproducibility");
  });

  it("repeats each stateful verification twice from fresh deterministic resets", () => {
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run test:integration/gu)).toHaveLength(2);
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run test:e2e:ci/gu)).toHaveLength(2);
    expect(reproducibilityScript.match(/run_with_fresh_redmine npm run context:measure:ci/gu)).toHaveLength(2);
  });

  it("does not allow CI to update the Context Budget baseline", () => {
    expect(setupConfig).not.toContain("context:baseline:update");
    expect(continuationConfig).not.toContain("context:baseline:update");
    expect(reproducibilityScript).not.toContain("context:baseline:update");
  });
});
