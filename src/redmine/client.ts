export interface RedmineClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class RedmineClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;

  constructor(options: RedmineClientOptions) {
    if (!options.baseUrl) {
      throw new Error("REDMINE_URL is required");
    }

    if (!options.apiKey) {
      throw new Error("REDMINE_API_KEY is required");
    }

    this.baseUrl = new URL(
      options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`,
    );
    this.apiKey = options.apiKey;
  }

  async get(path: string): Promise<unknown> {
    const requestUrl = new URL(path.replace(/^\/+/, ""), this.baseUrl);

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Redmine-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Redmine request failed: GET ${requestUrl.pathname} returned ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<unknown>;
  }

  async getCurrentUser(): Promise<unknown> {
    return this.get("/users/current.json");
  }
}

export function createRedmineClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RedmineClient {
  const baseUrl = env.REDMINE_URL;
  const apiKey = env.REDMINE_API_KEY;

  if (!baseUrl) {
    throw new Error("REDMINE_URL is required");
  }

  if (!apiKey) {
    throw new Error("REDMINE_API_KEY is required");
  }

  return new RedmineClient({ baseUrl, apiKey });
}
