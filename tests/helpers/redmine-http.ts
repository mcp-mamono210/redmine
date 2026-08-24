export type RedmineTestHttpMethod =
  | "GET"
  | "POST"
  | "PUT";

export interface RedmineTestHttpResponse {
  status: number;
  body: unknown;
}

export interface RedmineTestHttpClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

export class RedmineTestHttpClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RedmineTestHttpClientOptions) {
    this.baseUrl = new URL(
      options.baseUrl.endsWith("/")
        ? options.baseUrl
        : `${options.baseUrl}/`,
    );
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request(
    method: RedmineTestHttpMethod,
    path: string,
    body?: unknown,
  ): Promise<RedmineTestHttpResponse> {
    const url = new URL(
      path.replace(/^\/+/u, ""),
      this.baseUrl,
    );

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          "X-Redmine-API-Key": this.apiKey,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
              }),
        },
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
      });
    } catch {
      throw new Error(
        "Redmine test request failed before receiving " +
          `a response: ${method} ${url.pathname}`,
      );
    }

    const text = await response.text();

    if (!text) {
      return {
        status: response.status,
        body: null,
      };
    }

    try {
      return {
        status: response.status,
        body: JSON.parse(text) as unknown,
      };
    } catch {
      return {
        status: response.status,
        body: text,
      };
    }
  }
}
