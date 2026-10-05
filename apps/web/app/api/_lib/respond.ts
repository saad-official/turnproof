import "server-only";
import type { z } from "zod";

/**
 * JSON helpers for the API routes. Throw `ApiError` anywhere in a handler;
 * `errorResponse` turns it into `{ error, code? }` with its status. Anything
 * else is logged and replaced by a generic 500.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorResponse(error: unknown, label: string): Response {
  if (isApiError(error)) {
    return Response.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) },
      { status: error.status },
    );
  }
  console.error(`[api] ${label} failed`, error instanceof Error ? (error.stack ?? error.message) : error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Reads and validates a JSON body. 413 over MAX_BODY_BYTES, 415 for a
 * non-JSON content type (which also forces a CORS preflight on cross-site
 * requests), 400 for invalid JSON or a schema mismatch.
 */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Send the body as application/json.", "unsupported_media_type");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, "Request body is too large.", "too_large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "Request body is too large.", "too_large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Body is not valid JSON.", "invalid_json");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "Body does not match the expected shape.", "invalid_body", parsed.error.issues.slice(0, 20));
  }
  return parsed.data;
}
