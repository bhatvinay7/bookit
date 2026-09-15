const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function responseMessage(response: Response): Promise<string> {
  let payload: unknown;

  try {
    payload = await response.clone().json();
  } catch {
    try {
      payload = await response.text();
    } catch {
      payload = undefined;
    }
  }

  if (response.status === 503) {
    return "The service is temporarily unavailable. Please retry in a few seconds.";
  }
  if (response.status === 404) {
    return "The requested record was not found.";
  }
  if (response.status === 401 || response.status === 403) {
    return "Your admin session is no longer valid. Please sign in again.";
  }

  if (payload && typeof payload === "object") {
    const body = payload as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  if (typeof payload === "string" && payload.trim()) return payload;

  return `The request failed (${response.status}).`;
}

/** Performs one authenticated admin API request and turns non-2xx results into
 * useful errors. An empty collection is still a valid successful response. */
export async function adminFetchJson<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new AdminApiError(
      "Unable to reach the API. Check your connection and retry.",
      0,
    );
  }

  if (!response.ok) {
    throw new AdminApiError(await responseMessage(response), response.status);
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw new AdminApiError("The API returned an invalid response.", response.status);
  }
}

export function collectionOrThrow<T>(payload: unknown, resourceName: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  throw new AdminApiError(`The API returned invalid ${resourceName} data.`, 502);
}
