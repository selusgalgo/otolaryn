import { getSessionToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
}

interface NestErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

// The only thing in this app allowed to know the API's base URL and the
// session token — every page/action calls through here instead of
// fetching the NestJS API directly from client components, since the JWT
// lives in an httpOnly cookie the browser can't read anyway.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!options.skipAuth) {
    const token = await getSessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type");
  const data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    const body = (data ?? {}) as NestErrorBody;
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}
