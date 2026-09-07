import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateAgentBrief } from "./contract.js";

export type AgentBriefPersistenceErrorCode =
  | "invalid_brief"
  | "unsupported_storage_target"
  | "storage_target_mismatch"
  | "revision_gap"
  | "revision_conflict"
  | "artifact_not_found"
  | "stored_identity_mismatch"
  | "storage_write_failure";

export class AgentBriefPersistenceError extends Error {
  constructor(
    public readonly code: AgentBriefPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentBriefPersistenceError";
  }
}

export interface AgentBriefPersistenceConfig {
  repositoryRoot: string;
  repository: string;
  canonicalBranch?: string;
}

interface NormalizedPersistenceConfig {
  repositoryRoot: string;
  repository: string;
  canonicalBranch: string;
  canonicalBranchRef: string;
}

export interface AgentBriefPersistenceIdentity {
  repository: string;
  artifactPath: string;
  redmineIssueId: number;
  briefRevision: number;
}

export interface PersistedAgentBrief extends AgentBriefPersistenceIdentity {
  persistedRevision: string;
  markdown: string;
}

interface CommandResult {
  success: boolean;
  stdout: string;
}

const gitObjectIdPattern = /^[0-9a-f]+$/u;

function persistenceError(
  code: AgentBriefPersistenceErrorCode,
  message: string,
): AgentBriefPersistenceError {
  return new AgentBriefPersistenceError(code, message);
}

function normalizeConfig(
  config: AgentBriefPersistenceConfig,
): NormalizedPersistenceConfig {
  const canonicalBranch = config.canonicalBranch ?? "main";

  if (
    config.repositoryRoot.trim() === "" ||
    config.repository.trim() === "" ||
    canonicalBranch.trim() === "" ||
    config.repository.includes("\u0000") ||
    canonicalBranch.includes("\u0000")
  ) {
    throw persistenceError(
      "storage_write_failure",
      "Agent Brief storage configuration is invalid.",
    );
  }

  return {
    repositoryRoot: config.repositoryRoot,
    repository: config.repository,
    canonicalBranch,
    canonicalBranchRef: `refs/heads/${canonicalBranch}`,
  };
}

function requirePositiveSafeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be a positive safe integer`);
  }
}

export function agentBriefRevisionPath(
  redmineIssueId: number,
  briefRevision: number,
): string {
  requirePositiveSafeInteger(redmineIssueId, "redmineIssueId");
  requirePositiveSafeInteger(briefRevision, "briefRevision");

  return `docs/agent-briefs/${redmineIssueId}/revisions/${briefRevision}.md`;
}

function agentBriefRevisionDirectory(redmineIssueId: number): string {
  requirePositiveSafeInteger(redmineIssueId, "redmineIssueId");
  return `docs/agent-briefs/${redmineIssueId}/revisions`;
}

export function resolveAgentBriefPersistenceIdentity(
  markdown: string,
  repository: string,
): AgentBriefPersistenceIdentity {
  const validation = validateAgentBrief(markdown);

  if (!validation.success) {
    throw persistenceError(
      "invalid_brief",
      "Agent Brief failed canonical Phase 35 validation.",
    );
  }

  const metadata = validation.data.metadata;
  if (metadata.repository === undefined) {
    throw persistenceError(
      "unsupported_storage_target",
      "This storage boundary supports repository-targeted Agent Briefs only.",
    );
  }

  if (metadata.repository !== repository) {
    throw persistenceError(
      "storage_target_mismatch",
      "Agent Brief repository does not match the configured storage repository.",
    );
  }

  return {
    repository,
    artifactPath: agentBriefRevisionPath(
      metadata.redmine_issue_id,
      metadata.brief_revision,
    ),
    redmineIssueId: metadata.redmine_issue_id,
    briefRevision: metadata.brief_revision,
  };
}

function executeGit(
  config: NormalizedPersistenceConfig,
  args: string[],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: config.repositoryRoot,
        encoding: "utf8",
        env: extraEnv === undefined
          ? process.env
          : { ...process.env, ...extraEnv },
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        resolve({
          success: error === null,
          stdout,
        });
      },
    );
  });
}

async function runGit(
  config: NormalizedPersistenceConfig,
  args: string[],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await executeGit(config, args, extraEnv);
  if (!result.success) {
    throw persistenceError(
      "storage_write_failure",
      "Git storage operation failed.",
    );
  }
  return result.stdout;
}

async function ensureRepositoryReadable(
  config: NormalizedPersistenceConfig,
): Promise<void> {
  const repositoryCheck = await executeGit(config, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  if (
    !repositoryCheck.success ||
    repositoryCheck.stdout.trim() !== "true"
  ) {
    throw persistenceError(
      "storage_write_failure",
      "Configured Agent Brief storage is not a Git work tree.",
    );
  }

  const branchCheck = await executeGit(config, [
    "rev-parse",
    "--verify",
    config.canonicalBranchRef,
  ]);
  if (!branchCheck.success) {
    throw persistenceError(
      "storage_write_failure",
      "Configured canonical Git branch is not available.",
    );
  }
}

async function ensureCanonicalWriteBranch(
  config: NormalizedPersistenceConfig,
): Promise<void> {
  await ensureRepositoryReadable(config);

  const currentBranch = await runGit(config, ["branch", "--show-current"]);
  if (currentBranch.trim() !== config.canonicalBranch) {
    throw persistenceError(
      "storage_write_failure",
      "Agent Brief persistence requires the canonical branch to be checked out.",
    );
  }
}

function parseRevisionPaths(
  redmineIssueId: number,
  output: string,
): number[] {
  const directory = agentBriefRevisionDirectory(redmineIssueId);
  const prefix = `${directory}/`;
  const revisions: number[] = [];

  for (const path of output.split("\n").filter((line) => line !== "")) {
    if (!path.startsWith(prefix)) {
      throw persistenceError(
        "stored_identity_mismatch",
        "Stored Agent Brief path does not match the discovery boundary.",
      );
    }

    const relativePath = path.slice(prefix.length);
    const match = /^([1-9]\d*)\.md$/u.exec(relativePath);
    const revisionText = match?.[1];
    if (revisionText === undefined) {
      throw persistenceError(
        "stored_identity_mismatch",
        "Stored Agent Brief revision path is not canonical.",
      );
    }

    const revision = Number(revisionText);
    if (!Number.isSafeInteger(revision) || revision <= 0) {
      throw persistenceError(
        "stored_identity_mismatch",
        "Stored Agent Brief revision is not a positive safe integer.",
      );
    }
    revisions.push(revision);
  }

  revisions.sort((left, right) => left - right);
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index] !== index + 1) {
      throw persistenceError(
        "stored_identity_mismatch",
        "Stored Agent Brief revision history is not contiguous.",
      );
    }
  }

  return revisions;
}

async function listRevisions(
  config: NormalizedPersistenceConfig,
  redmineIssueId: number,
): Promise<number[]> {
  const directory = agentBriefRevisionDirectory(redmineIssueId);
  const output = await runGit(config, [
    "ls-tree",
    "-r",
    "--name-only",
    config.canonicalBranchRef,
    "--",
    directory,
  ]);
  return parseRevisionPaths(redmineIssueId, output);
}

async function gitPathExists(
  config: NormalizedPersistenceConfig,
  artifactPath: string,
): Promise<boolean> {
  const result = await executeGit(config, [
    "cat-file",
    "-e",
    `${config.canonicalBranchRef}:${artifactPath}`,
  ]);
  return result.success;
}

function verifyStoredIdentity(
  markdown: string,
  config: NormalizedPersistenceConfig,
  expectedIssueId: number,
  expectedRevision: number,
): void {
  const validation = validateAgentBrief(markdown);
  if (!validation.success) {
    throw persistenceError(
      "stored_identity_mismatch",
      "Stored Agent Brief does not satisfy the canonical artifact contract.",
    );
  }

  const metadata = validation.data.metadata;
  if (
    metadata.repository !== config.repository ||
    metadata.redmine_issue_id !== expectedIssueId ||
    metadata.brief_revision !== expectedRevision
  ) {
    throw persistenceError(
      "stored_identity_mismatch",
      "Stored Agent Brief metadata does not match its storage identity.",
    );
  }
}

function assertGitObjectId(value: string): string {
  const normalized = value.trim();
  if (!gitObjectIdPattern.test(normalized)) {
    throw persistenceError(
      "storage_write_failure",
      "Git did not return a valid immutable object identifier.",
    );
  }
  return normalized;
}

export async function readAgentBriefRevision(
  inputConfig: AgentBriefPersistenceConfig,
  redmineIssueId: number,
  briefRevision: number,
): Promise<PersistedAgentBrief> {
  const config = normalizeConfig(inputConfig);
  requirePositiveSafeInteger(redmineIssueId, "redmineIssueId");
  requirePositiveSafeInteger(briefRevision, "briefRevision");
  await ensureRepositoryReadable(config);

  const artifactPath = agentBriefRevisionPath(
    redmineIssueId,
    briefRevision,
  );
  if (!(await gitPathExists(config, artifactPath))) {
    throw persistenceError(
      "artifact_not_found",
      "Requested Agent Brief revision was not found.",
    );
  }

  const markdown = await runGit(config, [
    "cat-file",
    "-p",
    `${config.canonicalBranchRef}:${artifactPath}`,
  ]);
  verifyStoredIdentity(
    markdown,
    config,
    redmineIssueId,
    briefRevision,
  );

  const persistedRevision = assertGitObjectId(
    await runGit(config, [
      "rev-parse",
      `${config.canonicalBranchRef}:${artifactPath}`,
    ]),
  );

  return {
    repository: config.repository,
    artifactPath,
    redmineIssueId,
    briefRevision,
    persistedRevision,
    markdown,
  };
}

export async function readCurrentAgentBrief(
  inputConfig: AgentBriefPersistenceConfig,
  redmineIssueId: number,
): Promise<PersistedAgentBrief> {
  const config = normalizeConfig(inputConfig);
  requirePositiveSafeInteger(redmineIssueId, "redmineIssueId");
  await ensureRepositoryReadable(config);

  const revisions = await listRevisions(config, redmineIssueId);
  const currentRevision = revisions.at(-1);
  if (currentRevision === undefined) {
    throw persistenceError(
      "artifact_not_found",
      "No persisted Agent Brief exists for the requested Issue.",
    );
  }

  return readAgentBriefRevision(config, redmineIssueId, currentRevision);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw persistenceError(
      "storage_write_failure",
      "Unable to inspect the Agent Brief storage path.",
    );
  }
}

async function createGitBlob(
  config: NormalizedPersistenceConfig,
  markdown: string,
): Promise<string> {
  let temporaryDirectory: string | undefined;

  try {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "agent-brief-persistence-"),
    );
    const temporaryFile = join(temporaryDirectory, "brief.md");
    await writeFile(temporaryFile, markdown, {
      encoding: "utf8",
      flag: "wx",
    });
    return assertGitObjectId(
      await runGit(config, ["hash-object", "-w", temporaryFile]),
    );
  } catch (error) {
    if (error instanceof AgentBriefPersistenceError) {
      throw error;
    }
    throw persistenceError(
      "storage_write_failure",
      "Unable to create the immutable Agent Brief Git object.",
    );
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

async function createPersistenceCommit(
  config: NormalizedPersistenceConfig,
  baseCommit: string,
  identity: AgentBriefPersistenceIdentity,
  blobObjectId: string,
): Promise<string> {
  let temporaryDirectory: string | undefined;

  try {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "agent-brief-index-"),
    );
    const temporaryIndex = join(temporaryDirectory, "index");
    const indexEnv: NodeJS.ProcessEnv = {
      GIT_INDEX_FILE: temporaryIndex,
    };

    await runGit(config, ["read-tree", baseCommit], indexEnv);
    await runGit(
      config,
      [
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${blobObjectId},${identity.artifactPath}`,
      ],
      indexEnv,
    );
    const treeObjectId = assertGitObjectId(
      await runGit(config, ["write-tree"], indexEnv),
    );
    return assertGitObjectId(
      await runGit(config, [
        "commit-tree",
        treeObjectId,
        "-p",
        baseCommit,
        "-m",
        `Persist Agent Brief #${identity.redmineIssueId} revision ${identity.briefRevision}`,
      ]),
    );
  } catch (error) {
    if (error instanceof AgentBriefPersistenceError) {
      throw error;
    }
    throw persistenceError(
      "storage_write_failure",
      "Unable to create the Agent Brief persistence commit.",
    );
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

async function ensureSafeArtifactParent(
  config: NormalizedPersistenceConfig,
  artifactPath: string,
): Promise<string> {
  const components = artifactPath.split("/");
  const filename = components.pop();
  if (filename === undefined) {
    throw persistenceError(
      "storage_write_failure",
      "Canonical Agent Brief path is invalid.",
    );
  }

  let currentPath = config.repositoryRoot;
  for (const component of components) {
    currentPath = join(currentPath, component);
    try {
      const stats = await lstat(currentPath);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw persistenceError(
          "storage_write_failure",
          "Canonical Agent Brief parent path is not a safe directory.",
        );
      }
    } catch (error) {
      if (error instanceof AgentBriefPersistenceError) {
        throw error;
      }
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        try {
          await mkdir(currentPath);
        } catch (mkdirError) {
          if (
            mkdirError instanceof Error &&
            "code" in mkdirError &&
            mkdirError.code === "EEXIST"
          ) {
            const stats = await lstat(currentPath);
            if (stats.isDirectory() && !stats.isSymbolicLink()) {
              continue;
            }
          }
          throw persistenceError(
            "storage_write_failure",
            "Unable to create the canonical Agent Brief parent path.",
          );
        }
        continue;
      }
      throw persistenceError(
        "storage_write_failure",
        "Unable to inspect the canonical Agent Brief parent path.",
      );
    }
  }

  return join(currentPath, filename);
}

async function rollbackWorktreeArtifact(
  config: NormalizedPersistenceConfig,
  baseCommit: string,
  artifactPath: string,
  localPath: string,
): Promise<void> {
  await executeGit(config, [
    "reset",
    "--quiet",
    baseCommit,
    "--",
    artifactPath,
  ]);
  await rm(localPath, { force: true }).catch(() => undefined);
}

export async function persistAgentBrief(
  inputConfig: AgentBriefPersistenceConfig,
  markdown: string,
): Promise<PersistedAgentBrief> {
  const config = normalizeConfig(inputConfig);
  const identity = resolveAgentBriefPersistenceIdentity(
    markdown,
    config.repository,
  );
  await ensureCanonicalWriteBranch(config);

  const revisions = await listRevisions(config, identity.redmineIssueId);
  if (await gitPathExists(config, identity.artifactPath)) {
    const existing = await readAgentBriefRevision(
      config,
      identity.redmineIssueId,
      identity.briefRevision,
    );
    if (existing.markdown === markdown) {
      return existing;
    }
    throw persistenceError(
      "revision_conflict",
      "A different Agent Brief already exists for this revision identity.",
    );
  }

  const expectedRevision = (revisions.at(-1) ?? 0) + 1;
  if (identity.briefRevision !== expectedRevision) {
    throw persistenceError(
      "revision_gap",
      "Agent Brief revisions must be persisted contiguously starting at 1.",
    );
  }

  const baseCommit = assertGitObjectId(
    await runGit(config, ["rev-parse", config.canonicalBranchRef]),
  );
  const blobObjectId = await createGitBlob(config, markdown);
  const persistenceCommit = await createPersistenceCommit(
    config,
    baseCommit,
    identity,
    blobObjectId,
  );

  const localPath = await ensureSafeArtifactParent(
    config,
    identity.artifactPath,
  );
  if (await pathExists(localPath)) {
    throw persistenceError(
      "storage_write_failure",
      "The canonical Agent Brief work-tree path already exists outside Git history.",
    );
  }

  try {
    await writeFile(localPath, markdown, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch {
    throw persistenceError(
      "storage_write_failure",
      "Unable to create the canonical Agent Brief work-tree artifact.",
    );
  }

  const indexUpdate = await executeGit(config, [
    "update-index",
    "--add",
    "--cacheinfo",
    `100644,${blobObjectId},${identity.artifactPath}`,
  ]);
  if (!indexUpdate.success) {
    await rm(localPath, { force: true }).catch(() => undefined);
    throw persistenceError(
      "storage_write_failure",
      "Unable to stage the canonical Agent Brief artifact.",
    );
  }

  const refUpdate = await executeGit(config, [
    "update-ref",
    config.canonicalBranchRef,
    persistenceCommit,
    baseCommit,
  ]);
  if (!refUpdate.success) {
    await rollbackWorktreeArtifact(
      config,
      baseCommit,
      identity.artifactPath,
      localPath,
    );
    throw persistenceError(
      "storage_write_failure",
      "Canonical branch changed while persisting the Agent Brief.",
    );
  }

  const persisted = await readAgentBriefRevision(
    config,
    identity.redmineIssueId,
    identity.briefRevision,
  );
  if (persisted.persistedRevision !== blobObjectId) {
    throw persistenceError(
      "stored_identity_mismatch",
      "Persisted Agent Brief object identity does not match the written artifact.",
    );
  }

  return persisted;
}
