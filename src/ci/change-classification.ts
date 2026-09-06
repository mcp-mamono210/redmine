export type CiExecutionContext = "normal" | "release_candidate" | "release";

export type CiChangeClass =
  | "ordinary_documentation"
  | "contract_architecture_ci"
  | "runtime_test_environment"
  | "context_budget"
  | "ambiguous";

export type CiVerificationDomain =
  | "static"
  | "unit"
  | "integration"
  | "e2e"
  | "context_budget";

export interface CiPathClassification {
  inputPath: string;
  normalizedPath?: string;
  classes: CiChangeClass[];
  requiredVerificationDomains: CiVerificationDomain[];
  rule: string;
}

export interface CiChangeClassificationResult {
  executionContext: CiExecutionContext;
  pathClassifications: CiPathClassification[];
  classes: CiChangeClass[];
  requiredVerificationDomains: CiVerificationDomain[];
  heavyRuntimeVerificationSkippable: boolean;
  fullQualityGateRequired: boolean;
  failSafeApplied: boolean;
}

const CLASS_ORDER: readonly CiChangeClass[] = [
  "ordinary_documentation",
  "contract_architecture_ci",
  "runtime_test_environment",
  "context_budget",
  "ambiguous",
];

export const FULL_QUALITY_GATE_DOMAINS: readonly CiVerificationDomain[] = [
  "static",
  "unit",
  "integration",
  "e2e",
  "context_budget",
];

const VERIFICATION_ORDER = FULL_QUALITY_GATE_DOMAINS;

const ORDINARY_DOCUMENTATION_PATHS = new Set([
  "README.md",
  "CHANGELOG.md",
  "AGENTS.md",
]);

const FULL_BOUNDARY_PATHS = new Set([
  ".nvmrc",
  ".env.example",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.js",
]);

function normalizeRepoPath(inputPath: string): string | undefined {
  const normalizedSeparators = inputPath.trim().replaceAll("\\", "/");
  const withoutCurrentDirectory = normalizedSeparators.startsWith("./")
    ? normalizedSeparators.slice(2)
    : normalizedSeparators;

  if (
    !withoutCurrentDirectory ||
    withoutCurrentDirectory.startsWith("/") ||
    /^[A-Za-z]:\//u.test(withoutCurrentDirectory)
  ) {
    return undefined;
  }

  const segments = withoutCurrentDirectory.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return undefined;
  }

  return segments.join("/");
}

function orderedUnique<T extends string>(
  values: Iterable<T>,
  order: readonly T[],
): T[] {
  const set = new Set(values);
  return order.filter((value) => set.has(value));
}

function resultForPath(
  inputPath: string,
  normalizedPath: string | undefined,
  classes: readonly CiChangeClass[],
  requiredVerificationDomains: readonly CiVerificationDomain[],
  rule: string,
): CiPathClassification {
  return {
    inputPath,
    ...(normalizedPath !== undefined ? { normalizedPath } : {}),
    classes: orderedUnique(classes, CLASS_ORDER),
    requiredVerificationDomains: orderedUnique(
      requiredVerificationDomains,
      VERIFICATION_ORDER,
    ),
    rule,
  };
}

function classifyNormalizedPath(
  inputPath: string,
  normalizedPath: string,
): CiPathClassification {
  if (normalizedPath === "docs/context-budget.md") {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["contract_architecture_ci", "context_budget"],
      ["static", "unit", "context_budget"],
      "context-budget-contract",
    );
  }

  if (
    normalizedPath.startsWith("docs/contracts/") ||
    normalizedPath.startsWith("docs/adr/")
  ) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["contract_architecture_ci"],
      ["static", "unit"],
      "canonical-contract-or-adr",
    );
  }

  if (ORDINARY_DOCUMENTATION_PATHS.has(normalizedPath)) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["ordinary_documentation"],
      [],
      "ordinary-documentation-allowlist",
    );
  }

  if (
    normalizedPath.startsWith(".circleci/") ||
    FULL_BOUNDARY_PATHS.has(normalizedPath)
  ) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["contract_architecture_ci", "runtime_test_environment"],
      FULL_QUALITY_GATE_DOMAINS,
      "ci-runtime-boundary",
    );
  }

  if (normalizedPath.startsWith("src/ci/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["contract_architecture_ci"],
      ["static", "unit"],
      "ci-classification-tooling",
    );
  }

  if (normalizedPath.startsWith("src/agent-brief/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment"],
      ["static", "unit"],
      "agent-brief-runtime",
    );
  }

  if (
    normalizedPath.startsWith("src/mcp/") ||
    normalizedPath.startsWith("src/redmine/") ||
    normalizedPath === "src/config.ts" ||
    normalizedPath === "src/index.ts" ||
    normalizedPath === "src/server.ts"
  ) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment", "context_budget"],
      FULL_QUALITY_GATE_DOMAINS,
      "mcp-redmine-runtime",
    );
  }

  if (normalizedPath.startsWith("tests/unit/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment"],
      ["static", "unit"],
      "unit-test",
    );
  }

  if (normalizedPath.startsWith("tests/integration/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment"],
      ["static", "integration"],
      "integration-test",
    );
  }

  if (
    normalizedPath.startsWith("tests/helpers/context-") ||
    normalizedPath === "tests/e2e/context-baseline.json" ||
    normalizedPath === "tests/e2e/context-measurement.test.ts"
  ) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment", "context_budget"],
      ["static", "unit", "e2e", "context_budget"],
      "context-budget-verification",
    );
  }

  if (normalizedPath.startsWith("tests/e2e/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment"],
      ["static", "e2e"],
      "e2e-test",
    );
  }

  if (normalizedPath.startsWith("docker/")) {
    return resultForPath(
      inputPath,
      normalizedPath,
      ["runtime_test_environment", "context_budget"],
      ["static", "integration", "e2e", "context_budget"],
      "redmine-test-environment",
    );
  }

  return resultForPath(
    inputPath,
    normalizedPath,
    ["ambiguous"],
    FULL_QUALITY_GATE_DOMAINS,
    "ambiguous-fail-safe",
  );
}

function classifyPath(inputPath: string): CiPathClassification {
  const normalizedPath = normalizeRepoPath(inputPath);
  if (normalizedPath === undefined) {
    return resultForPath(
      inputPath,
      undefined,
      ["ambiguous"],
      FULL_QUALITY_GATE_DOMAINS,
      "invalid-path-fail-safe",
    );
  }

  return classifyNormalizedPath(inputPath, normalizedPath);
}

export function classifyChangedPaths(
  changedPaths: readonly string[],
  executionContext: CiExecutionContext = "normal",
): CiChangeClassificationResult {
  const sourcePaths = changedPaths.length > 0 ? changedPaths : [""];
  const pathClassifications = sourcePaths.map(classifyPath);

  const classes = orderedUnique(
    pathClassifications.flatMap((item) => item.classes),
    CLASS_ORDER,
  );
  const pathDomains = orderedUnique(
    pathClassifications.flatMap((item) => item.requiredVerificationDomains),
    VERIFICATION_ORDER,
  );

  const fullQualityGateRequired = executionContext !== "normal";
  const requiredVerificationDomains = fullQualityGateRequired
    ? [...FULL_QUALITY_GATE_DOMAINS]
    : pathDomains;
  const failSafeApplied = classes.includes("ambiguous");
  const heavyRuntimeVerificationSkippable =
    !fullQualityGateRequired &&
    !requiredVerificationDomains.some((domain) =>
      ["integration", "e2e", "context_budget"].includes(domain),
    );

  return {
    executionContext,
    pathClassifications,
    classes,
    requiredVerificationDomains,
    heavyRuntimeVerificationSkippable,
    fullQualityGateRequired,
    failSafeApplied,
  };
}
