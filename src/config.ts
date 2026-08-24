export interface WriteGuardConfig {
  writeEnabled: boolean;
  allowedProjects: readonly string[];
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
