import { NextResponse } from "next/server";
import { checkDemoCredentials, createSession, demoAccount } from "@/server/auth";
import { clientKey, jsonError, loginRateLimited, readBody } from "@/server/api";
import { hasErrors, validateLogin } from "@/lib/validation";

export async function POST(request: Request) {
  if (loginRateLimited(clientKey(request))) {
    return jsonError("Too many attempts. Please wait a minute and try again.", 429);
  }

  const body = await readBody(request);
  if (!body) return jsonError("Invalid request body.");

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const fields = validateLogin(email, password);
  if (hasErrors(fields)) {
    return jsonError("Please check the highlighted fields.", 422, fields);
  }

  if (!checkDemoCredentials(email, password)) {
    return jsonError("Incorrect email or password. Try the demo account below.", 401);
  }

  const account = demoAccount();
  const user = { name: account.name, email: account.email };
  await createSession(user);
  return NextResponse.json({ user });
}
