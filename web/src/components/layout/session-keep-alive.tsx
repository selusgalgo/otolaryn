"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SessionKeepAliveProps {
  // Instantes epoch en ms del JWT actual, leídos de la cookie en el servidor.
  expiresAt: number | null;
  issuedAt: number | null;
  sessionEndsAt: number | null;
}

// Cuántos minutos antes del techo absoluto se avisa, y cada cuánto se
// reevalúa el aviso.
const WARN_BEFORE_END_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;
// Eventos que cuentan como "la persona está trabajando". Pasivos y sin
// guardar nada: solo marcan el instante de la última actividad.
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel", "touchstart"] as const;

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Sesión deslizante: mientras haya actividad, y en cuanto al token le quede
// menos de la mitad de su vida, se pide uno nuevo (/session/refresh). Sin
// actividad no se renueva, así que la sesión caduca por inactividad como
// antes; con actividad dura hasta el techo absoluto (session_end), y unos
// minutos antes se avisa para que se guarde lo que se esté escribiendo (los
// borradores de consulta se conservan igualmente).
export function SessionKeepAlive({ expiresAt, issuedAt, sessionEndsAt }: SessionKeepAliveProps) {
  const [expires, setExpires] = useState(expiresAt);
  const [endsAt, setEndsAt] = useState(sessionEndsAt);
  const [now, setNow] = useState(() => Date.now());
  const [ended, setEnded] = useState(false);
  const lastActivityRef = useRef(0);
  const refreshingRef = useRef(false);
  const lifetimeMs = expiresAt && issuedAt ? expiresAt - issuedAt : null;
  const expiresRef = useRef(expires);
  useEffect(() => {
    expiresRef.current = expires;
  }, [expires]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const res = await fetch("/session/refresh", { method: "POST", cache: "no-store" });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      // Un redirect a /login (la cookie ya había caducado) llega como HTML.
      if (res.status === 401 || res.redirected || !isJson) {
        setEnded(true);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { expiresAt: number | null; sessionEndsAt: number | null };
        setExpires(data.expiresAt);
        if (data.sessionEndsAt) setEndsAt(data.sessionEndsAt);
      }
    } catch {
      // Sin red u otro fallo transitorio: se reintenta con la siguiente actividad.
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // Con actividad, y pasada la mitad de la vida del token, renovar. Se
  // limita a una comprobación cada pocos segundos para no hacer trabajo en
  // cada pulsación de tecla.
  useEffect(() => {
    if (!lifetimeMs) return;
    function onActivity() {
      const t = Date.now();
      if (t - lastActivityRef.current < 5_000) return;
      lastActivityRef.current = t;
      const exp = expiresRef.current;
      if (exp && exp - t < lifetimeMs! / 2) void refresh();
    }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [lifetimeMs, refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const nearingEnd = endsAt !== null && endsAt - now < WARN_BEFORE_END_MS && endsAt > now;

  if (!ended && !nearingEnd) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm shadow-lg md:bottom-6"
    >
      {ended ? (
        <>
          <p className="font-medium">Tu sesión ha caducado.</p>
          <p className="mt-1 text-muted-foreground">
            Lo que estés escribiendo en una consulta queda guardado como borrador en este dispositivo.
          </p>
          <a
            className="mt-2 inline-block font-medium text-primary underline"
            href={`/session/expired?reason=SESSION_EXPIRED&redirect=${encodeURIComponent(
              typeof window === "undefined" ? "/" : window.location.pathname + window.location.search,
            )}`}
          >
            Iniciar sesión de nuevo
          </a>
        </>
      ) : (
        <>
          <p className="font-medium">Por seguridad, tu sesión terminará a las {formatTime(endsAt!)}.</p>
          <p className="mt-1 text-muted-foreground">
            Guarda lo que estés escribiendo. Los borradores de consulta se conservan al volver a entrar.
          </p>
        </>
      )}
    </div>
  );
}
