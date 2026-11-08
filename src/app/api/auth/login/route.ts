import { NextResponse } from "next/server";
import { checkDemoCredentials, createSession, demoAccount } from "@/server/auth";
import { clientKey, guard, jsonError, loginRateLimited, readBody } from "@/server/api";
import { authenticateUser, upsertAccount } from "@/server/user-store";
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

  const normalized = email.trim().toLowerCase();
  let sessionName = "";

  // 1. Database account in `public.users` (scrypt verification).
  const auth = await guard(() => authenticateUser(normalized, password));
  if (auth.response) return auth.response;

  if (auth.data.ok) {
    sessionName = auth.data.user.name;
  } else if (checkDemoCredentials(normalized, password)) {
    // 2. Locally configured account — keeps sign-in working before the
    //    migration runs, or when the server key is not configured yet. The
    //    row is created/refreshed best effort so roles live in the database
    //    from then on; if that write is unavailable the sign-in still
    //    succeeds (credentials were verified) and the privileged routes
    //    report the configuration problem themselves.
    sessionName = demoAccount().name;
    const saved = await guard(() =>
      upsertAccount({
        email: normalized,
        name: demoAccount().name,
        password,
      }),
    );
    if (saved.data) sessionName = saved.data.name;
  } else if (auth.data.reason === "unavailable") {
    // The database could not be consulted and the local account did not match.
    return jsonError(
      "Accounts can't be verified right now. Add SUPABASE_SECRET_KEY to .env.local and restart the server.",
      503,
    );
  } else {
    return jsonError("Incorrect email or password.", 401);
  }

  const user = { name: sessionName, email: normalized };
  await createSession(user);
  return NextResponse.json({ user });
}
