import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ user });
}
