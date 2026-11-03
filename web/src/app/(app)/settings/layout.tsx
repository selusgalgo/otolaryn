import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { getCurrentUser } from "@/lib/auth";

// Shared shell for every Configuración section: the section menu stays on
// screen (left column on desktop, pills on mobile) while only the right
// side changes, so switching sections never goes through an index page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  // Not in the sidebar for anyone else, but guard the routes themselves
  // too — each section 403s at the backend anyway for a non-admin, this
  // just avoids landing on a broken page first.
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}
