#!/usr/bin/env node
/**
 * Generates (or verifies) the scrypt password hashes stored in `public.users`.
 *
 * The app never stores plaintext passwords: the SQL migration seeds accounts
 * with a hash produced by this script, and `src/server/user-store.ts` re-runs
 * the same derivation on login.
 *
 * Usage:
 *   node scripts/hash-password.mjs "your-password"        # print a new hash
 *   node scripts/hash-password.mjs --check "<hash>" "pw"  # verify an existing hash
 */
import crypto from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password, salt = crypto.randomBytes(16).toString("base64")) {
  const derived = crypto
    .scryptSync(password, salt, PARAMS.keylen, {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
    })
    .toString("base64");
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
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

const [, , command, ...rest] = process.argv;

if (command === "--check") {
  const [stored, password] = rest;
  console.log(verifyPassword(password, stored) ? "OK: password matches" : "FAIL: password does not match");
  process.exit(0);
} else if (command) {
  const password = command;
  const stored = hashPassword(password);
  console.log(stored);
  console.log(`self-check: ${verifyPassword(password, stored) ? "ok" : "failed"}`);
} else {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}
