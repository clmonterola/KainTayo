import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/types";

const COOKIE_NAME = "kt_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = SessionUser & { exp: number };

function secret() {
  return (
    process.env.AUTH_SECRET ??
    "kaintayo-development-only-secret-change-before-deploying"
  );
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.email || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function demoAccount() {
  return {
    name: process.env.DEMO_NAME ?? "Aling Nena",
    email: (process.env.DEMO_EMAIL ?? "demo@kaintayo.ph").toLowerCase(),
    password: process.env.DEMO_PASSWORD ?? "kain123",
  };
}

export function checkDemoCredentials(email: string, password: string) {
  const account = demoAccount();
  return (
    email.trim().toLowerCase() === account.email && password === account.password
  );
}

export async function createSession(user: SessionUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const isHttps = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
  const store = await cookies();
  store.set(COOKIE_NAME, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = decode(token);
  if (!payload) return null;
  return { name: payload.name, email: payload.email };
}

export async function requireSession(): Promise<SessionUser | null> {
  return getSession();
}
