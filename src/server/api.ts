import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "./auth";
import type { SessionUser } from "@/lib/types";

export function jsonError(
  message: string,
  status = 400,
  fields?: Record<string, string>,
) {
  return NextResponse.json({ error: message, ...(fields ? { fields } : {}) }, { status });
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function requireApiSession(): Promise<
  { user: SessionUser; response: null } | { user: null; response: NextResponse }
> {
  const user = await getSession();
  if (!user) {
    return {
      user: null,
      response: jsonError("Please sign in to continue.", 401),
    };
  }
  return { user, response: null };
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = NaN) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const attempts = new Map<string, number[]>();

/** Basic in-memory brute-force guard for the demo login endpoint. */
export function loginRateLimited(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);
  return false;
}

export function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
