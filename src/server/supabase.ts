import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase access.
 *
 * * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
 *   public by design — they may be inlined into client bundles.
 * * `SUPABASE_SECRET_KEY` (the `sb_secret_…` service-role key) is read from
 *   `.env.local` on the server only. This module is `server-only` and is never
 *   imported from a client component, so the secret cannot reach the browser.
 *
 * With Row Level Security enabled, the publishable key can only read the
 * public catalog (products + categories). Everything that writes — accounts,
 * dishes, orders, payments — needs the secret key, and every route still runs
 * its own session/role checks before it writes: privileged access never
 * replaces an authorization check.
 */

export class SupabaseConfigError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export class DatabaseError extends Error {
  readonly status = 500;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }
}

type ErrorLike = { message?: string; code?: string | null } | null;

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secret = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();

  if (!url || !publishable) {
    throw new SupabaseConfigError(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }
  return { url, publishable, secret };
}

/** True when both public Supabase env values are present. */
export function isSupabaseConfigured() {
  try {
    readEnv();
    return true;
  } catch {
    return false;
  }
}

/** True when the server key is configured (required for every write). */
export function hasServerAccess() {
  try {
    return Boolean(readEnv().secret);
  } catch {
    return false;
  }
}

let cached: { signature: string; client: SupabaseClient } | null = null;

/**
 * Client for read paths. Falls back to the publishable key so the public
 * catalog keeps working, but writes must go through `requireServerAccess()`.
 */
export function getServerClient(): SupabaseClient {
  const { url, publishable, secret } = readEnv();
  const key = secret || publishable;
  const signature = `${url}|${key}`;

  if (cached?.signature === signature) return cached.client;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "kaintayo" } },
  });
  cached = { signature, client };
  return client;
}

/**
 * Client for write paths. Fails fast with an actionable message instead of a
 * bare PostgREST permission error when the secret key is missing.
 */
export function requireServerAccess(): SupabaseClient {
  const { secret } = readEnv();
  if (!secret) {
    throw new SupabaseConfigError(
      "This needs the Supabase server key. Add SUPABASE_SECRET_KEY=… to " +
        ".env.local (Supabase Dashboard → Project Settings → API Keys) and " +
        "restart the server. Row Level Security keeps account, order and " +
        "payment rows out of reach of the publishable key, so writes are " +
        "refused instead of opened up.",
    );
  }
  return getServerClient();
}

/** Convert a Supabase/PostgREST error into a DatabaseError, or no-op. */
export function throwIfError(error: ErrorLike, fallback: string): void {
  if (!error) return;
  console.error(`[supabase] ${error.code ?? ""} ${error.message ?? ""}`.trim());

  // PGRST205: the table is not in the schema cache — the SQL migration has
  // not been applied yet. Say so instead of a generic failure.
  if (error.code === "PGRST205") {
    throw new DatabaseError(
      "The database tables are missing. Run the SQL migration in the Supabase SQL Editor (supabase/migrations/20261108000000_kaintayo_schema.sql), then reload.",
      error.code,
    );
  }
  throw new DatabaseError(fallback, error.code ?? undefined);
}
