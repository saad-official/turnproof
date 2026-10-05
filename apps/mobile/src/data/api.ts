// HTTP client for the Turnproof API (apps/web). Every request carries the Better Auth session cookie
// stored by `expoClient` in SecureStore (works in headless JS too).
//  - `authedFetch(path, init)` → raw `Response` (binary uploads, non-JSON bodies).
//  - `apiFetch<T>(path, init)` → parsed JSON, throws `ApiError` on non-2xx.
import { API_URL, getSessionCookie } from './auth-client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthedInit = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** JSON-serialised unless it is a string or binary (`Uint8Array` / `ArrayBuffer`). */
  body?: unknown;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Default 20 s (uploads pass a longer one). */
  timeoutMs?: number;
};

const isBinary = (b: unknown): b is Uint8Array | ArrayBuffer => b instanceof ArrayBuffer || ArrayBuffer.isView(b);

/** Absolute API URL for `path` (`/api/...`). */
export function apiUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * fetch with the session cookie, a timeout and the caller's abort signal. Never throws for HTTP
 * status (check `res.ok`); throws `ApiError(0, …, 'network')` when the request cannot complete.
 */
export async function authedFetch(path: string, init: AuthedInit = {}): Promise<Response> {
  const cookie = await getSessionCookie();
  const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
  if (cookie) headers.cookie = cookie;
  let body: BodyInit | undefined;
  if (init.body === undefined) body = undefined;
  else if (typeof init.body === 'string') body = init.body;
  else if (isBinary(init.body)) body = init.body as BodyInit;
  else {
    body = JSON.stringify(init.body);
    headers['content-type'] ??= 'application/json';
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(apiUrl(path, init.query), {
      method: init.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (error) {
    const aborted = init.signal?.aborted;
    throw new ApiError(0, aborted ? 'Cancelled' : error instanceof Error ? error.message : 'Network error', aborted ? 'aborted' : 'network');
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onAbort);
  }
}

/** Reads a JSON body (null for empty / non-JSON) and throws `ApiError` for non-2xx responses. */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; message?: string; code?: string };
    throw new ApiError(res.status, err.error ?? err.message ?? `Request failed (${res.status})`, err.code);
  }
  return json as T;
}

/** JSON request → parsed JSON response. Throws `ApiError` (status 0 = network failure / timeout). */
export async function apiFetch<T>(path: string, init: AuthedInit = {}): Promise<T> {
  return readJson<T>(await authedFetch(path, init));
}
