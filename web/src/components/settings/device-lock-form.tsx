"use client";

import { useState, useTransition } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generateDeviceCredentialAction,
  revokeDeviceCredentialAction,
  updateDeviceLockAction,
} from "@/lib/actions/settings";
import type { DeviceLock } from "@/lib/types";

interface DeviceLockFormProps {
  initialDeviceLock: DeviceLock;
}

// admin, own clinic — restringe solo a los profesionales (ver
// enforceDeviceLock en el backend); admin y recepción nunca se ven
// afectados. El token generado se muestra una sola vez: solo su hash se
// guarda, así que si se pierde el enlace no queda otra que generar uno
// nuevo (lo que además revoca el anterior).
export function DeviceLockForm({ initialDeviceLock }: DeviceLockFormProps) {
  const [deviceLock, setDeviceLock] = useState(initialDeviceLock);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const installLink =
    newToken && typeof window !== "undefined"
      ? `${window.location.origin}/device-auth?t=${newToken}`
      : null;

  function toggleEnabled(enabled: boolean) {
    setError(null);
    setDeviceLock((prev) => ({ ...prev, enabled }));
    startTransition(async () => {
      const state = await updateDeviceLockAction(enabled);
      if (state.error) setError(state.error);
      if (state.deviceLock) setDeviceLock(state.deviceLock);
    });
  }

  function generate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const state = await generateDeviceCredentialAction();
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.token) setNewToken(state.token);
      if (state.deviceLock) setDeviceLock(state.deviceLock);
    });
  }

  function revoke() {
    setError(null);
    setNewToken(null);
    startTransition(async () => {
      const state = await revokeDeviceCredentialAction();
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.deviceLock) setDeviceLock(state.deviceLock);
    });
  }

  async function copyLink() {
    if (!installLink) return;
    await navigator.clipboard.writeText(installLink);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2.5">
        <Checkbox
          checked={deviceLock.enabled}
          onCheckedChange={(checked) => toggleEnabled(checked === true)}
          disabled={pending}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium">Restringir a dispositivos autorizados</span>
          <span className="block text-sm text-muted-foreground">
            Los profesionales solo podrán iniciar sesión desde un ordenador donde se haya
            instalado la credencial de esta clínica.
          </span>
        </span>
      </label>

      {deviceLock.enabled && !deviceLock.hasCredential && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Activado pero sin credencial generada todavía — hasta que generes una, ningún
          profesional podrá iniciar sesión. Genera una credencial abajo.
        </p>
      )}

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {deviceLock.hasCredential
            ? "Hay una credencial activa. Generar una nueva desautoriza al instante todos los ordenadores instalados con la anterior."
            : "Genera una credencial y abre el enlace de instalación una vez en cada ordenador de la clínica."}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={generate} disabled={pending}>
            {deviceLock.hasCredential ? "Generar nueva credencial" : "Generar credencial"}
          </Button>
          {deviceLock.hasCredential && (
            <Button type="button" variant="outline" onClick={revoke} disabled={pending}>
              Revocar
            </Button>
          )}
        </div>
      </div>

      {installLink && (
        <div className="space-y-2 rounded-md border bg-muted/50 p-3">
          <p className="text-sm font-medium">Enlace de instalación (solo se muestra ahora)</p>
          <p className="text-xs text-muted-foreground">
            Ábrelo una vez en cada ordenador autorizado de la clínica. No lo compartas por un
            canal que no sea de confianza — cualquiera que lo abra deja ese ordenador autorizado.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background p-2 text-xs">
              {installLink}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <ClipboardDocumentIcon data-icon="inline-start" />
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
