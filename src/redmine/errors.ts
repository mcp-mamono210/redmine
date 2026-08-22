export class RedmineClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RedmineNetworkError extends RedmineClientError {
  readonly method: string;
  readonly path: string;

  constructor(
    message: string,
    method: string,
    path: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.method = method;
    this.path = path;
  }
}

export class RedmineHttpError extends RedmineClientError {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly statusText: string;
  readonly errors: string[];

  constructor(options: {
    method: string;
    path: string;
    status: number;
    statusText: string;
    errors?: string[];
  }) {
    const suffix =
      options.errors && options.errors.length > 0
        ? `: ${options.errors.join("; ")}`
        : "";

    super(
      `Redmine request failed: ${options.method} ${options.path} returned ` +
        `${options.status} ${options.statusText}${suffix}`,
    );

    this.method = options.method;
    this.path = options.path;
    this.status = options.status;
    this.statusText = options.statusText;
    this.errors = options.errors ?? [];
  }
}

export class RedmineResponseError extends RedmineClientError {
  readonly context: string;

  constructor(context: string, message: string, options?: ErrorOptions) {
    super(`Invalid Redmine response for ${context}: ${message}`, options);
    this.context = context;
  }
}
