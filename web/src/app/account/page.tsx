import Link from "next/link";
import { ArrowLeftIcon, LogOutIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";
import { logoutAction } from "@/lib/actions/auth";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import type { AccountProfile } from "@/lib/types";

// Deliberately outside both (app) and (platform) — every role, including
// superadmin (who has no tenant and never enters (app)), lands here the
// same way, so this page can't depend on either group's chrome/layout.
export default async function AccountPage() {
  const [me, profile] = await Promise.all([
    getCurrentUser(),
    apiFetch<AccountProfile>("/account"),
  ]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex items-center justify-between bg-primary px-4 py-3">
        <Link
          href={homeForRole(me.role)}
          className="flex items-center gap-2 text-sm font-medium text-primary-foreground/70 hover:text-primary-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Volver
        </Link>
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

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Mi cuenta</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cambiar contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
