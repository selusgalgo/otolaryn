import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  // superadmin has no tenant and none of these routes apply to it — the
  // backend would 403 every one of them anyway (RolesGuard), this just
  // avoids ever rendering the clinic chrome for that role.
  if (me.role === "superadmin") {
    redirect("/platform");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar me={me} />
      <main className="pb-16 md:pb-0 md:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
