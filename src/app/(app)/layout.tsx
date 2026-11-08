import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader user={user} />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <div className="pb-20 md:pb-0">
        <SiteFooter />
      </div>
    </div>
  );
}
