import {
  RedmineClient,
  createRedmineClientFromEnv,
} from "../../src/redmine/client.js";

export interface RedmineReadOnlyTestEnvironment {
  redmineUrl: string;
  readOnlyApiKey: string;
}

export interface RedmineWriterTestEnvironment
  extends RedmineReadOnlyTestEnvironment {
  writerApiKey: string;
}

function requireEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name];

  if (!value) {
    throw new Error(
      `${name} is required for Redmine integration tests`,
    );
  }

  return value;
}

export function getRedmineReadOnlyTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RedmineReadOnlyTestEnvironment {
  return {
    redmineUrl: requireEnv(env, "REDMINE_URL"),
    readOnlyApiKey: requireEnv(env, "REDMINE_API_KEY"),
  };
}

export function getRedmineWriterTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RedmineWriterTestEnvironment {
  return {
    ...getRedmineReadOnlyTestEnvironment(env),
    writerApiKey: requireEnv(
      env,
      "REDMINE_WRITE_API_KEY",
    ),
  };
}

export function createReadOnlyTestClient(
  env: NodeJS.ProcessEnv = process.env,
): RedmineClient {
  getRedmineReadOnlyTestEnvironment(env);

  return createRedmineClientFromEnv(env);
}

export function createWriterTestClient(
  env: NodeJS.ProcessEnv = process.env,
): RedmineClient {
  const { writerApiKey } =
    getRedmineWriterTestEnvironment(env);

  return createRedmineClientFromEnv({
    ...env,
    REDMINE_API_KEY: writerApiKey,
  });
}
