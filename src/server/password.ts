import "server-only";
import crypto from "node:crypto";

/**
 * Password hashing for `public.users.password_hash`.
 *
 * scrypt is memory-hard and ships in Node's standard library, so no native
 * dependency or database extension is required (the seeded hashes in
 * `supabase/migrations/…` are produced by `scripts/hash-password.mjs`, which
 * mirrors this implementation).
 *
 * Stored format: scrypt$N$r$p$<base64 salt>$<base64 derived key>
 */

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64")) {
  const derived = crypto
    .scryptSync(password, salt, PARAMS.keylen, {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
    })
    .toString("base64");
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;

  try {
    const keylen = Buffer.from(expected, "base64").length;
    const derived = crypto.scryptSync(password, salt, keylen, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const a = Buffer.from(derived.toString("base64"), "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
