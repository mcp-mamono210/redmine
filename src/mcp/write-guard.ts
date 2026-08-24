import type { WriteGuardConfig } from "../config.js";

export class WriteGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteGuardError";
  }
}

export class WriteGuard {
  private readonly allowedProjects: ReadonlySet<string>;

  constructor(private readonly config: WriteGuardConfig) {
    this.allowedProjects = new Set(config.allowedProjects);
  }

  canRegisterWriteTools(): boolean {
    return this.config.writeEnabled;
  }

  isProjectAllowed(projectIdentifier: string): boolean {
    if (!this.config.writeEnabled) {
      return false;
    }

    const normalized = projectIdentifier.trim();

    if (!normalized) {
      return false;
    }

    return this.allowedProjects.has(normalized);
  }

  assertProjectAllowed(projectIdentifier: string): void {
    if (!this.config.writeEnabled) {
      throw new WriteGuardError(
        "Write operations are disabled",
      );
    }

    if (!this.isProjectAllowed(projectIdentifier)) {
      throw new WriteGuardError(
        "Write operation is not allowed for this project",
      );
    }
  }
}
