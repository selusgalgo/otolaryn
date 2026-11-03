import { redirect } from "next/navigation";
import { DraftScopeProvider } from "@/components/layout/draft-scope";
import { SessionGuard } from "@/components/layout/session-guard";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { decodeJwtClaims } from "@/lib/jwt";
import { getSessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  // superadmin has no tenant and none of these routes apply to it — the
  // backend would 403 every one of them anyway (RolesGuard), this just
  // avoids ever rendering the clinic chrome for that role.
  if (me.role === "superadmin") {
    redirect("/platform");
  }

  // Identifica clínica + usuario para las claves de los borradores locales.
  // Se lee sin verificar la firma del JWT: getCurrentUser ya validó la
  // sesión contra la API y esto solo separa borradores de personas distintas.
  const claims = decodeJwtClaims(await getSessionToken());
  const draftScope = claims?.sub ? `${claims.tenant_id ?? "none"}:${claims.sub}` : null;

  return (
    <DraftScopeProvider scope={draftScope}>
      <div className="min-h-screen bg-surface">
        <Sidebar me={me} />
        <main className="pb-16 md:pb-0 md:pl-60">
          <div className="px-4 py-6">{children}</div>
        </main>
        <SessionGuard />
      </div>
    </DraftScopeProvider>
  );
}
