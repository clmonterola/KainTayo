import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { listProductIdsBySeller } from "./product-store";
import { DatabaseError, SupabaseConfigError } from "./supabase";
import { resolveActor, type AppUser } from "./user-store";
import type { Order, SessionUser, UserRole } from "@/lib/types";

export function jsonError(
  message: string,
  status = 400,
  fields?: Record<string, string>,
) {
  return NextResponse.json({ error: message, ...(fields ? { fields } : {}) }, { status });
}

/**
 * Wraps a database call so configuration problems (missing server key or env)
 * and query failures become clean JSON errors instead of 500 stack traces.
 */
export async function guard<T>(
  task: () => Promise<T>,
): Promise<{ data: T; response: null } | { data: null; response: NextResponse }> {
  try {
    return { data: await task(), response: null };
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return { data: null, response: jsonError(error.message, 503) };
    }
    if (error instanceof DatabaseError) {
      return { data: null, response: jsonError(error.message, 500) };
    }
    console.error("[api] unexpected store error:", error);
    return {
      data: null,
      response: jsonError("Something went wrong while talking to the database.", 500),
    };
  }
}

/**
 * Requires a signed-in session AND a resolved account row (id + role).
 * Every write in the app goes through this before touching Supabase.
 */
export async function requireActor(): Promise<
  { actor: AppUser; response: null } | { actor: null; response: NextResponse }
> {
  const auth = await requireApiSession();
  if (auth.response) return { actor: null, response: auth.response };

  const run = await guard(() => resolveActor(auth.user));
  if (run.response) return { actor: null, response: run.response };
  return { actor: run.data, response: null };
}

/** Server-side role gate — RLS alone never replaces this check. */
export function requireRole(
  actor: AppUser,
  roles: UserRole[],
): NextResponse | null {
  if (roles.includes(actor.role)) return null;
  return jsonError("Your account doesn't have access to that.", 403);
}

/**
 * Ownership check for a single order:
 * admins see everything, customers only their own, sellers their own orders
 * plus orders that contain one of their dishes.
 */
export async function canAccessOrder(
  order: Order,
  actor: AppUser,
): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (order.userId && order.userId === actor.id) return true;
  if (actor.role === "seller") {
    const owned = await listProductIdsBySeller(actor.id);
    return order.items.some(
      (item) => item.productId !== "" && owned.includes(item.productId),
    );
  }
  return false;
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
