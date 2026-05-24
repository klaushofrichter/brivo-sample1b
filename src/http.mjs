export class HttpError extends Error {
  constructor(message, { status, statusText, body, url }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.url = url;
  }
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? parseJsonOrText(text) : null;

  if (!response.ok) {
    throw new HttpError(
      `HTTP ${response.status} ${response.statusText} from ${url}`,
      {
        status: response.status,
        statusText: response.statusText,
        body,
        url
      }
    );
  }

  return body;
}

export function formatHttpError(error) {
  if (!(error instanceof HttpError)) {
    return error?.message || String(error);
  }

  const body =
    typeof error.body === "string"
      ? error.body
      : JSON.stringify(error.body, null, 2);

  return `${error.message}${body ? `\n${body}` : ""}`;
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
