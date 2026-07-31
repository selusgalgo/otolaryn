"use client";

import { useActionState, useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

// Only the email is remembered — never the password. Read on mount (not
// via useState's lazy initializer) so the first client render matches the
// server-rendered empty form and React doesn't flag a hydration mismatch.
const REMEMBER_EMAIL_KEY = "otolaryn_remembered_email";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

  function handleSubmit() {
    if (rememberEmail) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Otolaryn</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberEmail"
                checked={rememberEmail}
                onCheckedChange={(checked) => setRememberEmail(checked === true)}
                disabled={pending}
              />
              <Label htmlFor="rememberEmail" className="font-normal">
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
  );
}
