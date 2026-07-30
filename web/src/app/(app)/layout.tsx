import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/patients" className="font-bold">
              Otolaryn
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/patients" className="text-muted-foreground hover:text-foreground">
                Pacientes
              </Link>
              <Link href="/appointments" className="text-muted-foreground hover:text-foreground">
                Agenda
              </Link>
            </nav>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
