import { getSessionToken } from "./session";

// Exported (not just module-private) so a Route Handler that has to
// stream a raw file response — export/download, something apiFetch's
// JSON-only contract can't express — can still reuse the same base URL
// instead of re-deriving it.
export const API_URL = process.env.API_URL ?? "http://localhost:3000";

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
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
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
    throw errorFromResponse(res.status, data);
  }

  return data as T;
}

function errorFromResponse(status: number, data: unknown): ApiError {
  const body = (data ?? {}) as NestErrorBody;
  const message = Array.isArray(body.message)
    ? body.message.join(", ")
    : (body.message ?? `Request failed with status ${status}`);
  return new ApiError(status, message, data);
}

// For a multipart/form-data body (a file upload) — apiFetch always
// JSON.stringifies its body, which a File can't survive. No explicit
// Content-Type header here on purpose: fetch sets the multipart boundary
// itself from the FormData, and overriding it manually is the classic way
// to send a boundary-less body the server can't parse.
export async function apiFetchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type");
  const data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    throw errorFromResponse(res.status, data);
  }

  return data as T;
}
