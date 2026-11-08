import "server-only";
import crypto from "node:crypto";
import type { SessionUser, UserRole } from "@/lib/types";
import { demoAccount } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import {
  DatabaseError,
  SupabaseConfigError,
  requireServerAccess,
  throwIfError,
} from "./supabase";

/** An account as the application sees it after the session is resolved. */
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash?: string;
};

type PublicUserRow = Omit<UserRow, "password_hash">;

function mapUser(row: PublicUserRow): AppUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

const USER_COLUMNS = "id, email, name, role";

/**
 * Account reads always use the server key: password hashes and role rows must
 * never be reachable with the publishable key (RLS has no policy for them).
 */
async function readUserRow(email: string): Promise<UserRow | null> {
  const sb = requireServerAccess();
  const { data, error } = await sb
    .from("users")
    .select("id, email, name, role, password_hash")
    .eq("email", email)
    .maybeSingle();

  throwIfError(error, "We couldn't read the account record.");
  return (data as UserRow | null) ?? null;
}

export type AuthResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: "invalid" | "unavailable" };

/**
 * Verifies credentials against `public.users`.
 *
 * `unavailable` means the database could not be consulted (not configured,
 * server key missing, connection error) — callers may then fall back to the
 * locally configured account instead of reporting a wrong password.
 */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  let row: UserRow | null;

  try {
    row = await readUserRow(normalized);
  } catch (error) {
    if (error instanceof SupabaseConfigError || error instanceof DatabaseError) {
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }

  if (!row) return { ok: false, reason: "invalid" };
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, user: mapUser(row) };
}

function defaultRoleFor(email: string): UserRole {
  return email === demoAccount().email ? "admin" : "customer";
}

/**
 * Creates the account on first use, otherwise refreshes the name/password and
 * keeps the role that is already stored (a seeded seller stays a seller).
 */
export async function upsertAccount(input: {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}): Promise<AppUser> {
  const sb = requireServerAccess();
  const email = input.email.trim().toLowerCase();
  const role = input.role ?? defaultRoleFor(email);
  const passwordHash = hashPassword(input.password);

  const { data: inserted, error: insertError } = await sb
    .from("users")
    .insert({ email, name: input.name, role, password_hash: passwordHash })
    .select(USER_COLUMNS)
    .maybeSingle();

  if (!insertError) {
    if (inserted) return mapUser(inserted as PublicUserRow);
  } else if (insertError.code === "23505") {
    const { data: updated, error: updateError } = await sb
      .from("users")
      .update({ name: input.name, password_hash: passwordHash })
      .eq("email", email)
      .select(USER_COLUMNS)
      .maybeSingle();

    throwIfError(updateError, "We couldn't update the account record.");
    if (updated) return mapUser(updated as PublicUserRow);
  } else {
    throwIfError(insertError, "We couldn't save the account record.");
  }

  const row = await readUserRow(email);
  if (!row) throw new DatabaseError("We couldn't save the account record.");
  return mapUser(row);
}

/**
 * Resolves the signed-in session to an account row (id + role), creating one
 * on first use — e.g. a session cookie that predates the migration.
 *
 * Every privileged route calls this before it writes anything.
 */
export async function resolveActor(user: SessionUser): Promise<AppUser> {
  const email = user.email.trim().toLowerCase();
  const existing = await readUserRow(email);
  if (existing) return mapUser(existing);

  return upsertAccount({
    email,
    name: user.name,
    // Nobody knows this password: the row exists for authorization only, and
    // the next sign-in refreshes it through the configured local account.
    password: crypto.randomBytes(24).toString("base64url"),
  });
}
