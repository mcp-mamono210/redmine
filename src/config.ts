export interface WriteGuardConfig {
  writeEnabled: boolean;
  allowedProjects: readonly string[];
}

export interface AgentBriefApprovalConfig {
  repositoryRoot: string;
  repository: string;
  canonicalBranch: string;
  requirementCustomFieldIds: readonly number[];
}

type Environment = Readonly<Record<string, string | undefined>>;

function parseWriteEnabled(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(
    'REDMINE_WRITE_ENABLED must be either "true" or "false"',
  );
}

function parseAllowedProjects(
  value: string | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((project) => project.trim())
        .filter((project) => project.length > 0),
    ),
  ];
}

function requireNonBlank(
  env: Environment,
  name: string,
): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required when write tools are enabled`);
  }

  return value;
}

function parseRequirementCustomFieldIds(
  value: string | undefined,
): readonly number[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

  if (parts.some((item) => !/^[1-9]\d*$/u.test(item))) {
    throw new Error(
      "AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS must contain only positive safe integers",
    );
  }

  const ids = parts.map((item) => Number(item));

  if (ids.some((id) => !Number.isSafeInteger(id))) {
    throw new Error(
      "AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS must contain only positive safe integers",
    );
  }

  return [...new Set(ids)].sort((left, right) => left - right);
}

export function loadWriteGuardConfig(
  env: Environment = process.env,
): WriteGuardConfig {
  return {
    writeEnabled: parseWriteEnabled(
      env.REDMINE_WRITE_ENABLED,
    ),
    allowedProjects: parseAllowedProjects(
      env.REDMINE_ALLOWED_PROJECTS,
    ),
  };
}

export function loadAgentBriefApprovalConfig(
  env: Environment = process.env,
): AgentBriefApprovalConfig {
  const canonicalBranch =
    env.AGENT_BRIEF_CANONICAL_BRANCH?.trim() || "main";

  return {
    repositoryRoot: requireNonBlank(
      env,
      "AGENT_BRIEF_REPOSITORY_ROOT",
    ),
    repository: requireNonBlank(
      env,
      "AGENT_BRIEF_REPOSITORY",
    ),
    canonicalBranch,
    requirementCustomFieldIds:
      parseRequirementCustomFieldIds(
        env.AGENT_BRIEF_REQUIREMENT_CUSTOM_FIELD_IDS,
      ),
  };
}
