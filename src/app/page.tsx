import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/order" : "/login");
}
