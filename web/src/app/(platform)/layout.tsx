import { redirect } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { LogOutIcon } from "lucide-react";

// Deliberately its own chrome, not a variant of (app)/layout.tsx — superadmin
// manages clinics themselves, a different domain from the per-clinic Sidebar
// (Pacientes/Agenda/etc.), so there's no shared nav to reuse here.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (me.role !== "superadmin") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex items-center justify-between bg-primary px-4 py-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
          <span className="text-sm font-medium text-primary-foreground/70">Panel Eiduo</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="rounded-lg p-2 text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground"
          >
            <LogOutIcon className="size-5" />
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
