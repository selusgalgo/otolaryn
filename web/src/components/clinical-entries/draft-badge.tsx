import { draftExpiryText, isDraftExpiringSoon } from "@/lib/draft-expiry";

// Etiqueta "Borrador" de una consulta que aún no está firmada, con el aviso de
// cuándo se borrará sola (10 días sin tocarla). Pasa a tono de alerta en los
// últimos días para que se termine a tiempo. Sin estado ni hooks: sirve tanto
// en páginas de servidor (ficha, panel) como dentro de componentes de cliente.
export function DraftBadge({ expiresAt, showExpiry = true }: { expiresAt: string | null; showExpiry?: boolean }) {
  const soon = isDraftExpiringSoon(expiresAt);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        Borrador
      </span>
      {showExpiry && expiresAt && (
        <span className={`text-xs ${soon ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
          {draftExpiryText(expiresAt)}
        </span>
      )}
    </span>
  );
}
