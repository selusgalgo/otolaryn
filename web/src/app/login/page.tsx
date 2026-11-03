"use client";

import { useActionState, useEffect, useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { clearAllDrafts } from "@/lib/drafts";

const initialState: LoginState = {};

// Only the identifier (email or username) is remembered — never the
// password. Read on mount (not via useState's lazy initializer) so the
// first client render matches the server-rendered empty form and React
// doesn't flag a hydration mismatch.
const REMEMBER_IDENTIFIER_KEY = "otolaryn_remembered_identifier";

// Por qué se ha llegado aquí (?reason=). Los motivos de sesión terminada
// vienen del middleware, de /session/expired o del logout.
const REASON_MESSAGES: Record<string, string> = {
  SESSION_EXPIRED: "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.",
  TOKEN_INVALID: "Tu sesión ya no es válida. Vuelve a iniciar sesión para continuar.",
  DEVICE_LOCKED:
    "Este dispositivo no está autorizado para acceder a la aplicación. Contacta con el administrador de la clínica.",
  ACCOUNT_DISABLED: "Tu cuenta está desactivada. Contacta con el administrador de la clínica.",
};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [identifier, setIdentifier] = useState("");
  const [rememberIdentifier, setRememberIdentifier] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // A dónde volver tras entrar — lo trae un ?redirect= cuando se llega
  // aquí desde un aviso de "tu sesión ha caducado" a media tarea (ver
  // ClinicalEntryForm), para no aterrizar en /dashboard sino justo donde
  // se estaba. Via useEffect/window.location, no useSearchParams(), por
  // la misma razón que REMEMBER_IDENTIFIER_KEY se lee así: /login es una
  // página estática, y useSearchParams() la forzaría a exigir un límite
  // Suspense.
  const [redirectTarget, setRedirectTarget] = useState("");
  const [reasonMessage, setReasonMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_IDENTIFIER_KEY);
    if (saved) {
      setIdentifier(saved);
      setRememberIdentifier(true);
    }
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (redirect) setRedirectTarget(redirect);
    const reason = params.get("reason") ?? "";
    if (REASON_MESSAGES[reason]) setReasonMessage(REASON_MESSAGES[reason]);
    // Cierre de sesión explícito: no dejar borradores clínicos en un
    // ordenador que puede ser compartido. Una sesión caducada NO pasa por
    // aquí — ahí los borradores son justo lo que hay que conservar.
    if (reason === "logout") clearAllDrafts();
  }, []);

  function handleSubmit() {
    if (rememberIdentifier) {
      localStorage.setItem(REMEMBER_IDENTIFIER_KEY, identifier);
    } else {
      localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
    }
  }

  return (
    // Same soft blue glow from the top as the Mederi website's hero.
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(51,102,255,0.12),transparent_70%)] p-4">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
        <img src="/logo.svg" alt="Mederi" className="mx-auto mb-8 h-36 w-auto" />
        <Card className="rounded-2xl shadow-lg">
          <CardContent className="px-6 py-2">
            <h1 className="text-center text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            {reasonMessage && (
              <p role="status" className="mt-2 text-center text-sm text-muted-foreground">
                {reasonMessage}
              </p>
            )}
            {redirectTarget && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Al entrar, volverás justo donde lo dejaste.
              </p>
            )}
            <form action={formAction} onSubmit={handleSubmit} className="mt-8 space-y-6">
              <input type="hidden" name="redirect" value={redirectTarget} />
              <div className="space-y-2">
                <Label htmlFor="identifier">Email o nombre de usuario</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  disabled={pending}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    disabled={pending}
                    className="pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={pending}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rememberIdentifier"
                  checked={rememberIdentifier}
                  onCheckedChange={(checked) => setRememberIdentifier(checked === true)}
                  disabled={pending}
                />
                <Label htmlFor="rememberIdentifier" className="font-normal">
                  Recordar usuario
                </Label>
              </div>
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        {/* No hay flujo de recuperación propio (el reseteo de contraseña lo
            hace el admin de la clínica, no la persona misma) — sin este
            aviso, alguien que la olvida no tiene ninguna pista de qué
            hacer. */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Olvidaste tu contraseña? Contacta con el administrador de tu clínica.
        </p>
      </div>
    </div>
  );
}
