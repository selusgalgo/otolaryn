"use client";

import { useActionState, useEffect, useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

// Only the identifier (email or username) is remembered — never the
// password. Read on mount (not via useState's lazy initializer) so the
// first client render matches the server-rendered empty form and React
// doesn't flag a hydration mismatch.
const REMEMBER_IDENTIFIER_KEY = "otolaryn_remembered_identifier";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [identifier, setIdentifier] = useState("");
  const [rememberIdentifier, setRememberIdentifier] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_IDENTIFIER_KEY);
    if (saved) {
      setIdentifier(saved);
      setRememberIdentifier(true);
    }
  }, []);

  function handleSubmit() {
    if (rememberIdentifier) {
      localStorage.setItem(REMEMBER_IDENTIFIER_KEY, identifier);
    } else {
      localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
        <img src="/logo.svg" alt="Otolaryn" className="mx-auto mb-8 h-7 w-auto" />
        <Card>
          <CardContent>
            <h1 className="text-center text-2xl font-bold">Iniciar sesión</h1>
            <form action={formAction} onSubmit={handleSubmit} className="mt-8 space-y-6">
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
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
