"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

// Límite de error de toda la app. Sin él, cualquier excepción no controlada
// (una acción sin try/catch, una sesión rechazada por la API en medio de una
// transición...) dejaba el "Application error" por defecto de Next, sin
// salida. Aquí se ofrece reintentar o volver a entrar — la ruta a la que
// volver se conserva — y se avisa de que los borradores de consulta siguen
// en este dispositivo.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const loginHref = `/session/expired?reason=SESSION_EXPIRED&redirect=${encodeURIComponent(pathname || "/")}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
      <h1 className="text-xl font-semibold">Algo no ha ido bien</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ha ocurrido un error inesperado. Si tu sesión ha caducado, vuelve a iniciar sesión. Si estabas
        escribiendo una consulta, el borrador sigue guardado en este dispositivo y se recuperará al volver a
        abrirla.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          Reintentar
        </Button>
        <Button asChild variant="outline">
          <a href={loginHref}>Iniciar sesión de nuevo</a>
        </Button>
      </div>
    </div>
  );
}
